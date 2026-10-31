// Pure helpers for the AI question flow (see docs/ai-question-flow.md).
// No Firebase imports, so everything here can be unit tested with `node --test`.
import crypto from "crypto";

export const QUESTION_SOURCES = ["mixed", "human", "ai"];

export const MIN_AI_QUESTIONS_PER_RUN = 1;
export const MAX_AI_QUESTIONS_PER_RUN = 10;

const AI_QUESTION_CHOICE_COUNT = 4;
const MAX_QUESTION_LENGTH = 4000;
const MAX_CHOICE_LENGTH = 1000;
const MAX_EXPLANATION_LENGTH = 8000;

/**
 * Picks the question source a request is served from. The frontend implements the same rule.
 *
 * @param {object} params
 * @param {boolean} params.aiQuestionsServed - Whether the admin switched AI question serving on.
 * @param {boolean} params.isPro - Whether the caller is a pro member.
 * @param {string} [params.requestedQuestionSource] - The source the caller asked for.
 * @return {string} "mixed", "human" or "ai".
 */
export function resolveQuestionSource({aiQuestionsServed, isPro, requestedQuestionSource}) {
  if (!aiQuestionsServed) return "human"; // serving off: human questions only
  if (!isPro) return "mixed"; // free users get no choice
  return QUESTION_SOURCES.includes(requestedQuestionSource) ? requestedQuestionSource : "mixed";
}

/**
 * Reads the questionSource a client sent. Not sending one means "mixed".
 *
 * @param {any} value - The questionSource from the request.
 * @return {string} A value from QUESTION_SOURCES.
 * @throws {Error} When the value is not one of QUESTION_SOURCES.
 */
export function parseRequestedQuestionSource(value) {
  if (value === undefined || value === null) return "mixed";
  if (QUESTION_SOURCES.includes(value)) return value;
  throw new Error(`questionSource must be one of: ${QUESTION_SOURCES.join(", ")}`);
}

/**
 * Applies defaults to the metadata/aiQuestions document.
 *
 * @param {object} [data] - The document data (undefined when the document is missing).
 * @return {{generationEnabled: boolean, servingEnabled: boolean, questionsPerRun: number}} The settings.
 */
export function normalizeAiSettings(data) {
  const parsedQuestionsPerRun = Number(data?.questionsPerRun);
  const questionsPerRun = Number.isFinite(parsedQuestionsPerRun) ?
    Math.min(MAX_AI_QUESTIONS_PER_RUN, Math.max(MIN_AI_QUESTIONS_PER_RUN, Math.trunc(parsedQuestionsPerRun))) :
    MIN_AI_QUESTIONS_PER_RUN;
  return {
    generationEnabled: data?.generationEnabled === true,
    servingEnabled: data?.servingEnabled === true,
    questionsPerRun,
  };
}

/**
 * Validates an AI question (the generator applies the same rules). Values are trimmed first,
 * and the trimmed values are the ones to store.
 *
 * @param {object} candidate - {question, choices, correctChoice, explanation}.
 * @return {object} {valid: true, question: {question, choices, correctChoice, explanation}}
 *   or {valid: false, errors: string[]}.
 */
export function validateAiQuestion(candidate) {
  const errors = [];

  const question = typeof candidate?.question === "string" ? candidate.question.trim() : "";
  if (question === "") {
    errors.push("Question must be non-empty text");
  } else if (question.length > MAX_QUESTION_LENGTH) {
    errors.push(`Question must be at most ${MAX_QUESTION_LENGTH} characters`);
  }

  let choices = [];
  if (!Array.isArray(candidate?.choices) || candidate.choices.length !== AI_QUESTION_CHOICE_COUNT) {
    errors.push(`There must be exactly ${AI_QUESTION_CHOICE_COUNT} choices`);
  } else {
    choices = candidate.choices.map((choice) => typeof choice === "string" ? choice.trim() : "");
    choices.forEach((choice, choiceIndex) => {
      if (choice === "") {
        errors.push(`Choice ${choiceIndex + 1} must be non-empty text`);
      } else if (choice.length > MAX_CHOICE_LENGTH) {
        errors.push(`Choice ${choiceIndex + 1} must be at most ${MAX_CHOICE_LENGTH} characters`);
      }
    });
    const everyChoiceHasText = choices.every((choice) => choice !== "");
    const distinctChoiceCount = new Set(choices.map((choice) => choice.toLowerCase())).size;
    if (everyChoiceHasText && distinctChoiceCount !== choices.length) {
      errors.push("Choices must all be different");
    }
  }

  const correctChoice = candidate?.correctChoice;
  const correctChoiceIsValid = Number.isInteger(correctChoice) &&
    correctChoice >= 0 && correctChoice < AI_QUESTION_CHOICE_COUNT;
  if (!correctChoiceIsValid) {
    errors.push(`Correct choice must be an integer from 0 to ${AI_QUESTION_CHOICE_COUNT - 1}`);
  }

  const explanation = typeof candidate?.explanation === "string" ? candidate.explanation.trim() : "";
  if (explanation === "") {
    errors.push("Explanation must be non-empty text");
  } else {
    if (explanation.length > MAX_EXPLANATION_LENGTH) {
      errors.push(`Explanation must be at most ${MAX_EXPLANATION_LENGTH} characters`);
    }
    const expectedExplanationStart = `Correct Answer: ${correctChoice + 1}`;
    if (correctChoiceIsValid && !explanation.startsWith(expectedExplanationStart)) {
      errors.push(`Explanation must start with "${expectedExplanationStart}"`);
    }
  }

  if (errors.length > 0) return {valid: false, errors};
  return {valid: true, question: {question, choices, correctChoice, explanation}};
}

/**
 * Hashes a repo file's content. The nightly importer has always used this hash to skip unchanged chapters.
 *
 * @param {string} content - The decoded file content.
 * @return {string} The sha256 hex digest.
 */
export function computeContentHash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Parses a chapter file (a JSON array of questions; the human repo's <chapter>.js files use the same format).
 *
 * @param {string} content - The decoded file content.
 * @return {Array} The parsed questions.
 * @throws {Error} When the content is not JSON or not an array.
 */
export function parseChapterFile(content) {
  const parsedContent = JSON.parse(content);
  if (!Array.isArray(parsedContent)) {
    throw new Error("A chapter file must contain a JSON array of questions");
  }
  return parsedContent;
}

/**
 * Serializes an AI chapter file the way the AI repo stores it.
 *
 * @param {Array} questions - The chapter's questions.
 * @return {string} Pretty-printed JSON with a trailing newline.
 */
export function serializeAiChapterFile(questions) {
  return JSON.stringify(questions, null, 2) + "\n";
}

/**
 * Appends an approved question to a chapter file, unless a question with the same aiQuestionId is
 * already there (an earlier attempt that committed but did not finish).
 *
 * @param {Array} existingQuestions - The parsed chapter file ([] when the file does not exist yet).
 * @param {object} newQuestion - {chapter, question, choices, correctChoice, explanation, premium, aiQuestionId}.
 * @return {object} {alreadyInRepo: true, questionNumber, entryAlreadyInRepo (the entry as it is in the file)}
 *   or {alreadyInRepo: false, questionNumber, fileContent}.
 */
export function appendAiQuestionToChapterFile(existingQuestions, newQuestion) {
  if (typeof newQuestion.aiQuestionId !== "string" || newQuestion.aiQuestionId === "") {
    throw new Error("newQuestion.aiQuestionId must be a non-empty string");
  }

  const entryAlreadyInRepo = existingQuestions.find((entry) => entry?.aiQuestionId === newQuestion.aiQuestionId);
  if (entryAlreadyInRepo) {
    return {alreadyInRepo: true, questionNumber: Number(entryAlreadyInRepo.questionNumber), entryAlreadyInRepo};
  }

  const existingQuestionNumbers = existingQuestions
      .map((entry) => Number(entry?.questionNumber))
      .filter((questionNumber) => Number.isFinite(questionNumber));
  const questionNumber = Math.max(0, ...existingQuestionNumbers) + 1;

  // Same fields and key order as the human question files, plus the AI flag and id.
  const appendedEntry = {
    chapter: newQuestion.chapter,
    questionNumber,
    question: newQuestion.question,
    choices: newQuestion.choices,
    correctChoice: newQuestion.correctChoice,
    premium: newQuestion.premium,
    explanation: newQuestion.explanation,
    aiGenerated: true,
    aiQuestionId: newQuestion.aiQuestionId,
  };

  return {
    alreadyInRepo: false,
    questionNumber,
    fileContent: serializeAiChapterFile([...existingQuestions, appendedEntry]),
  };
}

/**
 * Checks for a string with something other than whitespace in it.
 *
 * @param {any} value - The value to check.
 * @return {boolean} Whether the value is non-empty text.
 */
function isNonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Turns a parsed AI chapter file into questionsAi documents. The chapter and aiGenerated flag are always
 * stamped here rather than trusted from the file.
 *
 * Every entry must have the shape the app needs to show it, since a hand edit on GitHub can break one. These are
 * shape checks only: the authoring rules of validateAiQuestion are not applied to entries already in the file.
 *
 * @param {Array} parsedFileArray - The parsed chapter file.
 * @param {number} chapter - The chapter the file belongs to.
 * @return {Array<object>} The documents to write to questionsAi.
 * @throws {Error} Naming the first invalid entry (its position, and its questionNumber when that is valid).
 */
export function normalizeAiChapterDocs(parsedFileArray, chapter) {
  return parsedFileArray.map((entry, entryIndex) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Entry ${entryIndex + 1} is not an object`);
    }

    const shapeProblems = [];
    const questionNumber = Number(entry.questionNumber);
    const questionNumberIsValid = Number.isInteger(questionNumber) && questionNumber > 0;
    if (!questionNumberIsValid) shapeProblems.push("questionNumber must be a positive integer");
    if (!isNonEmptyText(entry.question)) shapeProblems.push("question must be a non-empty string");
    if (!Array.isArray(entry.choices) || entry.choices.length !== AI_QUESTION_CHOICE_COUNT ||
        !entry.choices.every(isNonEmptyText)) {
      shapeProblems.push(`choices must be an array of ${AI_QUESTION_CHOICE_COUNT} non-empty strings`);
    }
    if (!Number.isInteger(entry.correctChoice) || entry.correctChoice < 0 || entry.correctChoice >= AI_QUESTION_CHOICE_COUNT) {
      shapeProblems.push(`correctChoice must be an integer from 0 to ${AI_QUESTION_CHOICE_COUNT - 1}`);
    }
    if (!isNonEmptyText(entry.explanation)) shapeProblems.push("explanation must be a non-empty string");
    if (shapeProblems.length > 0) {
      const entryLabel = questionNumberIsValid ?
        `Entry ${entryIndex + 1} (questionNumber ${questionNumber})` :
        `Entry ${entryIndex + 1}`;
      throw new Error(`${entryLabel}: ${shapeProblems.join("; ")}`);
    }

    // A question added by hand on GitHub may have no aiQuestionId.
    const aiQuestionId = typeof entry.aiQuestionId === "string" && entry.aiQuestionId !== "" ?
      entry.aiQuestionId :
      `chapter${chapter}_question${questionNumber}`;
    return {
      chapter,
      questionNumber,
      question: entry.question,
      choices: entry.choices,
      correctChoice: entry.correctChoice,
      premium: entry.premium !== false,
      explanation: entry.explanation,
      aiGenerated: true,
      aiQuestionId,
    };
  });
}

/**
 * Converts a Firestore Timestamp, a Date or a parseable date string to an ISO string.
 *
 * @param {any} value - The value to convert.
 * @return {string|null} The ISO string, or null when the value is not a valid date.
 */
export function timestampToIso(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string") {
    const parsedMs = Date.parse(value);
    return Number.isNaN(parsedMs) ? null : new Date(parsedMs).toISOString();
  }
  return null;
}
