import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  QUESTION_SOURCES,
  resolveQuestionSource,
  parseRequestedQuestionSource,
  normalizeAiSettings,
  validateAiQuestion,
  computeContentHash,
  parseChapterFile,
  serializeAiChapterFile,
  appendAiQuestionToChapterFile,
  normalizeAiChapterDocs,
  timestampToIso,
} from "../aiQuestions.js";

const validCandidate = {
  question: "Which court hears appeals from Small Claims in BC?",
  choices: ["BC Supreme Court", "BC Court of Appeal", "Supreme Court of Canada", "Provincial Court"],
  correctChoice: 0,
  explanation: "Correct Answer: 1\n\nAppeals from Small Claims go to the BC Supreme Court.",
};

const newApprovedQuestion = {
  chapter: 3,
  question: "New question?",
  choices: ["A", "B", "C", "D"],
  correctChoice: 2,
  explanation: "Correct Answer: 3\n\nBecause C.",
  premium: false,
  aiQuestionId: "pendingQuestion123",
};

describe("resolveQuestionSource", () => {
  it("serves human questions only while AI serving is off, whatever was requested", () => {
    for (const isPro of [true, false]) {
      for (const requestedQuestionSource of [...QUESTION_SOURCES, undefined, null, "bogus"]) {
        assert.equal(resolveQuestionSource({aiQuestionsServed: false, isPro, requestedQuestionSource}), "human");
      }
    }
  });

  it("gives free users mixed questions with no choice", () => {
    for (const requestedQuestionSource of [...QUESTION_SOURCES, undefined, null, "bogus"]) {
      assert.equal(resolveQuestionSource({aiQuestionsServed: true, isPro: false, requestedQuestionSource}), "mixed");
    }
  });

  it("gives pro users the source they asked for, defaulting to mixed", () => {
    for (const requestedQuestionSource of QUESTION_SOURCES) {
      assert.equal(
          resolveQuestionSource({aiQuestionsServed: true, isPro: true, requestedQuestionSource}),
          requestedQuestionSource,
      );
    }
    for (const requestedQuestionSource of [undefined, null, "bogus", "AI"]) {
      assert.equal(resolveQuestionSource({aiQuestionsServed: true, isPro: true, requestedQuestionSource}), "mixed");
    }
  });
});

describe("parseRequestedQuestionSource", () => {
  it("defaults to mixed when no source is sent", () => {
    assert.equal(parseRequestedQuestionSource(undefined), "mixed");
    assert.equal(parseRequestedQuestionSource(null), "mixed");
  });

  it("returns valid sources unchanged", () => {
    for (const questionSource of QUESTION_SOURCES) {
      assert.equal(parseRequestedQuestionSource(questionSource), questionSource);
    }
  });

  it("throws for anything else", () => {
    for (const invalidQuestionSource of ["", "AI", "both", 1, true, {}, []]) {
      assert.throws(() => parseRequestedQuestionSource(invalidQuestionSource), /questionSource must be one of/);
    }
  });
});

describe("normalizeAiSettings", () => {
  it("defaults everything off with one question per run when the document is missing or empty", () => {
    const defaultSettings = {generationEnabled: false, servingEnabled: false, questionsPerRun: 1};
    assert.deepEqual(normalizeAiSettings(undefined), defaultSettings);
    assert.deepEqual(normalizeAiSettings(null), defaultSettings);
    assert.deepEqual(normalizeAiSettings({}), defaultSettings);
  });

  it("only treats the boolean true as enabled", () => {
    assert.deepEqual(
        normalizeAiSettings({generationEnabled: true, servingEnabled: true, questionsPerRun: 5}),
        {generationEnabled: true, servingEnabled: true, questionsPerRun: 5},
    );
    const truthyNonBooleans = normalizeAiSettings({generationEnabled: "true", servingEnabled: 1});
    assert.equal(truthyNonBooleans.generationEnabled, false);
    assert.equal(truthyNonBooleans.servingEnabled, false);
  });

  it("clamps questionsPerRun to an integer from 1 to 10", () => {
    assert.equal(normalizeAiSettings({questionsPerRun: 0}).questionsPerRun, 1);
    assert.equal(normalizeAiSettings({questionsPerRun: -4}).questionsPerRun, 1);
    assert.equal(normalizeAiSettings({questionsPerRun: 11}).questionsPerRun, 10);
    assert.equal(normalizeAiSettings({questionsPerRun: 1000}).questionsPerRun, 10);
    assert.equal(normalizeAiSettings({questionsPerRun: 3.7}).questionsPerRun, 3);
    assert.equal(normalizeAiSettings({questionsPerRun: "4"}).questionsPerRun, 4);
    assert.equal(normalizeAiSettings({questionsPerRun: "many"}).questionsPerRun, 1);
    assert.equal(normalizeAiSettings({questionsPerRun: Number.NaN}).questionsPerRun, 1);
    assert.equal(normalizeAiSettings({questionsPerRun: Infinity}).questionsPerRun, 1);
  });
});

describe("validateAiQuestion", () => {
  it("accepts a valid question", () => {
    assert.deepEqual(validateAiQuestion(validCandidate), {valid: true, question: validCandidate});
  });

  it("returns trimmed values", () => {
    const result = validateAiQuestion({
      question: "  Which court?  ",
      choices: [" A ", "B\n", "\tC", "D"],
      correctChoice: 3,
      explanation: "\n Correct Answer: 4\n\nBecause D. ",
    });
    assert.deepEqual(result, {
      valid: true,
      question: {
        question: "Which court?",
        choices: ["A", "B", "C", "D"],
        correctChoice: 3,
        explanation: "Correct Answer: 4\n\nBecause D.",
      },
    });
  });

  /**
   * Validates the valid candidate with some fields replaced and returns the errors.
   * @param {object} overrides - Fields to replace.
   * @return {Array<string>} The validation errors.
   */
  function errorsFor(overrides) {
    const result = validateAiQuestion({...validCandidate, ...overrides});
    assert.equal(result.valid, false);
    assert.equal(result.question, undefined);
    return result.errors;
  }

  it("rejects a missing, blank or too long question", () => {
    assert.deepEqual(errorsFor({question: undefined}), ["Question must be non-empty text"]);
    assert.deepEqual(errorsFor({question: "   "}), ["Question must be non-empty text"]);
    assert.deepEqual(errorsFor({question: 42}), ["Question must be non-empty text"]);
    assert.deepEqual(errorsFor({question: "q".repeat(4001)}), ["Question must be at most 4000 characters"]);
    assert.equal(validateAiQuestion({...validCandidate, question: "q".repeat(4000)}).valid, true);
  });

  it("rejects anything but exactly 4 choices", () => {
    assert.deepEqual(errorsFor({choices: ["A", "B", "C"]}), ["There must be exactly 4 choices"]);
    assert.deepEqual(errorsFor({choices: ["A", "B", "C", "D", "E"]}), ["There must be exactly 4 choices"]);
    assert.deepEqual(errorsFor({choices: "A, B, C, D"}), ["There must be exactly 4 choices"]);
    assert.deepEqual(errorsFor({choices: undefined}), ["There must be exactly 4 choices"]);
  });

  it("rejects blank, non-string and too long choices", () => {
    assert.deepEqual(errorsFor({choices: ["A", " ", "C", "D"]}), ["Choice 2 must be non-empty text"]);
    assert.deepEqual(errorsFor({choices: ["A", "B", 3, "D"]}), ["Choice 3 must be non-empty text"]);
    assert.deepEqual(errorsFor({choices: ["A", "B", "C", "d".repeat(1001)]}), ["Choice 4 must be at most 1000 characters"]);
  });

  it("rejects duplicate choices, ignoring case and surrounding whitespace", () => {
    assert.deepEqual(errorsFor({choices: ["A", "B", "C", "A"]}), ["Choices must all be different"]);
    assert.deepEqual(errorsFor({choices: ["Yes", "No", " yes ", "Maybe"]}), ["Choices must all be different"]);
  });

  it("rejects a correctChoice that is not an integer from 0 to 3", () => {
    for (const correctChoice of [-1, 4, 1.5, "1", null, undefined]) {
      assert.deepEqual(errorsFor({correctChoice}), ["Correct choice must be an integer from 0 to 3"]);
    }
  });

  it("rejects a missing, too long or wrongly prefixed explanation", () => {
    assert.deepEqual(errorsFor({explanation: ""}), ["Explanation must be non-empty text"]);
    assert.deepEqual(errorsFor({explanation: null}), ["Explanation must be non-empty text"]);
    assert.deepEqual(
        errorsFor({explanation: "Correct Answer: 1 " + "e".repeat(8000)}),
        ["Explanation must be at most 8000 characters"],
    );
    assert.deepEqual(errorsFor({explanation: "Correct Answer: 2\n\nWrong number."}), [
      "Explanation must start with \"Correct Answer: 1\"",
    ]);
    assert.deepEqual(errorsFor({explanation: "The answer is 1."}), ["Explanation must start with \"Correct Answer: 1\""]);
    assert.deepEqual(errorsFor({correctChoice: 2}), ["Explanation must start with \"Correct Answer: 3\""]);
  });

  it("reports every problem at once", () => {
    assert.deepEqual(validateAiQuestion(null).errors, [
      "Question must be non-empty text",
      "There must be exactly 4 choices",
      "Correct choice must be an integer from 0 to 3",
      "Explanation must be non-empty text",
    ]);
  });
});

describe("computeContentHash", () => {
  it("returns the sha256 hex digest", () => {
    assert.equal(computeContentHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("parseChapterFile and serializeAiChapterFile", () => {
  it("round trips a chapter file", () => {
    const questions = [{chapter: 1, questionNumber: 1, question: "Q?", choices: ["A", "B", "C", "D"]}];
    const fileContent = serializeAiChapterFile(questions);
    assert.equal(fileContent, JSON.stringify(questions, null, 2) + "\n");
    assert.deepEqual(parseChapterFile(fileContent), questions);
    assert.equal(serializeAiChapterFile(parseChapterFile(fileContent)), fileContent);
  });

  it("throws when the file is not a JSON array", () => {
    assert.throws(() => parseChapterFile("{\"questions\": []}"), /JSON array/);
    assert.throws(() => parseChapterFile("null"), /JSON array/);
    assert.throws(() => parseChapterFile("not json"), SyntaxError);
  });
});

describe("appendAiQuestionToChapterFile", () => {
  it("numbers the first question of a new file 1", () => {
    const result = appendAiQuestionToChapterFile([], newApprovedQuestion);
    assert.equal(result.alreadyInRepo, false);
    assert.equal(result.questionNumber, 1);
    assert.deepEqual(parseChapterFile(result.fileContent), [{...newApprovedQuestion, questionNumber: 1}]);
  });

  it("numbers the next question after the highest existing number", () => {
    const existingQuestions = [1, 2, 3].map((questionNumber) => ({questionNumber, aiQuestionId: `existing${questionNumber}`}));
    const result = appendAiQuestionToChapterFile(existingQuestions, newApprovedQuestion);
    assert.equal(result.questionNumber, 4);
    assert.equal(parseChapterFile(result.fileContent).length, 4);
  });

  it("uses the highest number plus one when there are gaps", () => {
    const existingQuestions = [{questionNumber: 7, aiQuestionId: "a"}, {questionNumber: 2, aiQuestionId: "b"}];
    assert.equal(appendAiQuestionToChapterFile(existingQuestions, newApprovedQuestion).questionNumber, 8);
  });

  it("reports a question that is already in the file with its number and entry, without new content", () => {
    // As an earlier attempt committed it, before this retry's edits.
    const entryAlreadyInRepo = {...newApprovedQuestion, questionNumber: 5, question: "As first approved?", premium: true};
    const existingQuestions = [
      {questionNumber: 1, aiQuestionId: "other"},
      entryAlreadyInRepo,
      {questionNumber: 6, aiQuestionId: "another"},
    ];
    assert.deepEqual(appendAiQuestionToChapterFile(existingQuestions, newApprovedQuestion), {
      alreadyInRepo: true,
      questionNumber: 5,
      entryAlreadyInRepo,
    });
  });

  it("appends the entry with the repo key order, keeps existing entries and does not mutate them", () => {
    const existingEntry = {chapter: 3, questionNumber: 1, question: "Old?", aiQuestionId: "old"};
    const existingQuestions = [existingEntry];
    const {fileContent} = appendAiQuestionToChapterFile(existingQuestions, {
      aiQuestionId: "pendingQuestion123",
      premium: true,
      explanation: "Correct Answer: 1\n\nBecause A.",
      correctChoice: 0,
      choices: ["A", "B", "C", "D"],
      question: "Reordered?",
      chapter: 3,
    });
    const parsedFile = parseChapterFile(fileContent);
    assert.deepEqual(parsedFile[0], existingEntry);
    assert.deepEqual(Object.keys(parsedFile[1]), [
      "chapter", "questionNumber", "question", "choices", "correctChoice", "explanation", "premium", "aiQuestionId",
    ]);
    assert.equal(existingQuestions.length, 1);
  });

  it("serializes with 2-space indentation and a trailing newline", () => {
    const {fileContent} = appendAiQuestionToChapterFile([], newApprovedQuestion);
    assert.ok(fileContent.startsWith("[\n  {\n    \"chapter\": 3,\n    \"questionNumber\": 1,"));
    assert.ok(fileContent.endsWith("}\n]\n"));
  });

  it("throws without an aiQuestionId so it can never match an entry that has none", () => {
    assert.throws(
        () => appendAiQuestionToChapterFile([{questionNumber: 1}], {...newApprovedQuestion, aiQuestionId: undefined}),
        /aiQuestionId/,
    );
  });
});

describe("normalizeAiChapterDocs", () => {
  const fileEntry = {
    chapter: 3,
    questionNumber: 2,
    question: "Q?",
    choices: ["A", "B", "C", "D"],
    correctChoice: 1,
    explanation: "Correct Answer: 2\n\nBecause B.",
    premium: false,
    aiQuestionId: "pendingQuestion123",
  };

  it("maps file entries to questionsAi documents", () => {
    assert.deepEqual(normalizeAiChapterDocs([fileEntry], 3), [{...fileEntry, aiGenerated: true}]);
  });

  it("always stamps aiGenerated true and the chapter being imported", () => {
    const [questionDoc] = normalizeAiChapterDocs([{...fileEntry, chapter: 9, aiGenerated: false}], 3);
    assert.equal(questionDoc.chapter, 3);
    assert.equal(questionDoc.aiGenerated, true);
  });

  it("defaults premium to true unless the file says false", () => {
    const [missingPremium, falsePremium, stringPremium] = normalizeAiChapterDocs([
      {...fileEntry, premium: undefined},
      {...fileEntry, premium: false},
      {...fileEntry, premium: "no"},
    ], 3);
    assert.equal(missingPremium.premium, true);
    assert.equal(falsePremium.premium, false);
    assert.equal(stringPremium.premium, true);
  });

  it("falls back to a chapter and number based aiQuestionId for questions added by hand", () => {
    const questionDocs = normalizeAiChapterDocs([
      {...fileEntry, aiQuestionId: undefined, questionNumber: 4},
      {...fileEntry, aiQuestionId: "", questionNumber: 5},
      {...fileEntry, aiQuestionId: 12, questionNumber: "6"},
    ], 3);
    assert.deepEqual(questionDocs.map((questionDoc) => questionDoc.aiQuestionId), [
      "chapter3_question4",
      "chapter3_question5",
      "chapter3_question6",
    ]);
    assert.equal(questionDocs[2].questionNumber, 6);
  });

  it("drops fields that are not part of a questionsAi document", () => {
    const [questionDoc] = normalizeAiChapterDocs([{...fileEntry, notes: "hand edit"}], 3);
    assert.equal(questionDoc.notes, undefined);
  });

  it("throws when an entry is not an object", () => {
    for (const invalidEntry of [null, "question", 7, [fileEntry]]) {
      assert.throws(() => normalizeAiChapterDocs([fileEntry, invalidEntry], 3), {message: "Entry 2 is not an object"});
    }
  });

  it("throws naming the entry and its questionNumber when a field the app needs is malformed", () => {
    const malformedFieldCases = [
      [{question: undefined}, "question must be a non-empty string"],
      [{question: "  "}, "question must be a non-empty string"],
      [{question: 7}, "question must be a non-empty string"],
      [{choices: undefined}, "choices must be an array of 4 non-empty strings"],
      [{choices: "A, B, C, D"}, "choices must be an array of 4 non-empty strings"],
      [{choices: ["A", "B", "C"]}, "choices must be an array of 4 non-empty strings"],
      [{choices: ["A", "B", "C", "D", "E"]}, "choices must be an array of 4 non-empty strings"],
      [{choices: ["A", " ", "C", "D"]}, "choices must be an array of 4 non-empty strings"],
      [{choices: ["A", "B", 3, "D"]}, "choices must be an array of 4 non-empty strings"],
      [{correctChoice: undefined}, "correctChoice must be an integer from 0 to 3"],
      [{correctChoice: -1}, "correctChoice must be an integer from 0 to 3"],
      [{correctChoice: 4}, "correctChoice must be an integer from 0 to 3"],
      [{correctChoice: 1.5}, "correctChoice must be an integer from 0 to 3"],
      [{correctChoice: "1"}, "correctChoice must be an integer from 0 to 3"],
      [{explanation: undefined}, "explanation must be a non-empty string"],
      [{explanation: " \n "}, "explanation must be a non-empty string"],
      [{explanation: 12}, "explanation must be a non-empty string"],
    ];
    for (const [malformedFields, expectedProblem] of malformedFieldCases) {
      assert.throws(
          () => normalizeAiChapterDocs([fileEntry, {...fileEntry, questionNumber: 5, ...malformedFields}], 3),
          {message: `Entry 2 (questionNumber 5): ${expectedProblem}`},
      );
    }
  });

  it("leaves the questionNumber out of the message when it is not a positive integer", () => {
    for (const questionNumber of [undefined, null, "", "abc", 0, -2, 1.5]) {
      assert.throws(
          () => normalizeAiChapterDocs([{...fileEntry, questionNumber}], 3),
          {message: "Entry 1: questionNumber must be a positive integer"},
      );
    }
  });

  it("lists every problem of the invalid entry", () => {
    assert.throws(() => normalizeAiChapterDocs([{questionNumber: 4, premium: false}], 3), {
      message: "Entry 1 (questionNumber 4): question must be a non-empty string; " +
        "choices must be an array of 4 non-empty strings; correctChoice must be an integer from 0 to 3; " +
        "explanation must be a non-empty string",
    });
  });

  it("does not apply the authoring rules to entries already in the file", () => {
    const entryBreakingAuthoringRules = {
      ...fileEntry,
      question: "q".repeat(4001),
      choices: ["Same", "same", " Same ", "d".repeat(1001)],
      explanation: "No \"Correct Answer: N\" prefix.",
    };
    assert.deepEqual(
        normalizeAiChapterDocs([entryBreakingAuthoringRules], 3),
        [{...entryBreakingAuthoringRules, aiGenerated: true}],
    );
  });

  it("accepts a file an approval wrote", () => {
    const {fileContent} = appendAiQuestionToChapterFile([{...fileEntry, aiQuestionId: "earlier"}], newApprovedQuestion);
    const questionDocs = normalizeAiChapterDocs(parseChapterFile(fileContent), 3);
    assert.deepEqual(questionDocs[1], {...newApprovedQuestion, questionNumber: 3, aiGenerated: true});
  });

  it("refuses a file with a hand-edited entry missing its explanation, even after a valid question is appended", () => {
    const entryWithoutExplanation = {...fileEntry, aiQuestionId: "handEdited"};
    delete entryWithoutExplanation.explanation;
    const {fileContent} = appendAiQuestionToChapterFile([entryWithoutExplanation], newApprovedQuestion);
    assert.throws(
        () => normalizeAiChapterDocs(parseChapterFile(fileContent), 3),
        {message: "Entry 1 (questionNumber 2): explanation must be a non-empty string"},
    );
  });
});

describe("timestampToIso", () => {
  it("converts Firestore Timestamps through toDate", () => {
    const firestoreTimestamp = {toDate: () => new Date("2026-10-30T12:34:56.000Z")};
    assert.equal(timestampToIso(firestoreTimestamp), "2026-10-30T12:34:56.000Z");
  });

  it("converts Dates and parseable strings", () => {
    assert.equal(timestampToIso(new Date("2026-01-02T03:04:05.006Z")), "2026-01-02T03:04:05.006Z");
    assert.equal(timestampToIso("2026-01-02T03:04:05Z"), "2026-01-02T03:04:05.000Z");
    assert.equal(timestampToIso("2026-01-02"), "2026-01-02T00:00:00.000Z");
  });

  it("returns null for anything else", () => {
    for (const value of [null, undefined, "", "not a date", 1767225600000, {}, new Date("invalid")]) {
      assert.equal(timestampToIso(value), null);
    }
  });
});
