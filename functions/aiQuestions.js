// Pure helpers for AI questions (see docs/ai-question-flow.md). The helpers shared with AI flashcards are in
// aiContent.js. No Firebase imports, so everything here can be unit tested with `node --test`.
import {appendAiEntryToChapterFile, isNonEmptyText, normalizeAiChapterEntries} from "./aiContent.js";

// The fields an admin can edit before approving, which are the ones validateAiQuestion checks.
export const AI_QUESTION_EDITABLE_FIELD_NAMES = ["question", "choices", "correctChoice", "explanation"];

const AI_QUESTION_CHOICE_COUNT = 4;
const MAX_QUESTION_LENGTH = 4000;
const MAX_CHOICE_LENGTH = 1000;
const MAX_EXPLANATION_LENGTH = 8000;

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
 * Appends an approved question to its chapter file (questions/<chapter>.json), unless a question with the same
 * aiQuestionId is already there (an earlier attempt that committed but did not finish).
 *
 * @param {Array} existingQuestions - The parsed chapter file ([] when the file does not exist yet).
 * @param {object} newQuestion - {chapter, question, choices, correctChoice, explanation, premium, aiQuestionId}.
 * @return {object} {alreadyInRepo: true, questionNumber, entryAlreadyInRepo (the entry as it is in the file)}
 *   or {alreadyInRepo: false, questionNumber, fileContent}.
 */
export function appendAiQuestionToChapterFile(existingQuestions, newQuestion) {
  return appendAiEntryToChapterFile({
    existingEntries: existingQuestions,
    itemNumberFieldName: "questionNumber",
    aiIdFieldName: "aiQuestionId",
    newEntryAiId: newQuestion.aiQuestionId,
    // Same fields and key order as the human question files, plus the AI flag and id.
    buildNewEntry: (questionNumber) => ({
      chapter: newQuestion.chapter,
      questionNumber,
      question: newQuestion.question,
      choices: newQuestion.choices,
      correctChoice: newQuestion.correctChoice,
      premium: newQuestion.premium,
      explanation: newQuestion.explanation,
      aiGenerated: true,
      aiQuestionId: newQuestion.aiQuestionId,
    }),
  });
}

/**
 * Lists what keeps a question file entry from being shown (its questionNumber is checked separately).
 *
 * @param {object} entry - A chapter file entry.
 * @return {Array<string>} The problems, empty when the entry is fine.
 */
function findAiQuestionEntryShapeProblems(entry) {
  const shapeProblems = [];
  if (!isNonEmptyText(entry.question)) shapeProblems.push("question must be a non-empty string");
  if (!Array.isArray(entry.choices) || entry.choices.length !== AI_QUESTION_CHOICE_COUNT ||
      !entry.choices.every(isNonEmptyText)) {
    shapeProblems.push(`choices must be an array of ${AI_QUESTION_CHOICE_COUNT} non-empty strings`);
  }
  if (!Number.isInteger(entry.correctChoice) || entry.correctChoice < 0 || entry.correctChoice >= AI_QUESTION_CHOICE_COUNT) {
    shapeProblems.push(`correctChoice must be an integer from 0 to ${AI_QUESTION_CHOICE_COUNT - 1}`);
  }
  if (!isNonEmptyText(entry.explanation)) shapeProblems.push("explanation must be a non-empty string");
  return shapeProblems;
}

/**
 * Turns a parsed AI question chapter file into questionsAi documents. The chapter and aiGenerated flag are always
 * stamped here rather than trusted from the file.
 *
 * @param {Array} parsedFileArray - The parsed chapter file.
 * @param {number} chapter - The chapter the file belongs to.
 * @return {Array<object>} The documents to write to questionsAi.
 * @throws {Error} Naming the first invalid entry (its position, and its questionNumber when that is valid).
 */
export function normalizeAiQuestionDocs(parsedFileArray, chapter) {
  return normalizeAiChapterEntries({
    parsedFileArray,
    itemNumberFieldName: "questionNumber",
    findEntryShapeProblems: findAiQuestionEntryShapeProblems,
    buildLiveDoc: (entry, questionNumber) => ({
      chapter,
      questionNumber,
      question: entry.question,
      choices: entry.choices,
      correctChoice: entry.correctChoice,
      premium: entry.premium !== false,
      explanation: entry.explanation,
      aiGenerated: true,
      // A question added by hand on GitHub may have no aiQuestionId.
      aiQuestionId: typeof entry.aiQuestionId === "string" && entry.aiQuestionId !== "" ?
        entry.aiQuestionId :
        `chapter${chapter}_question${questionNumber}`,
    }),
  });
}
