import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {parseChapterFile} from "../aiContent.js";
import {
  AI_FLASHCARD_EDITABLE_FIELD_NAMES,
  validateAiFlashcard,
  appendAiFlashcardToChapterFile,
  normalizeAiFlashcardDocs,
} from "../aiFlashcards.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The key order of every card in the human repo's flashcards.js.
const HUMAN_FLASHCARD_KEY_ORDER = ["documentID", "cardNumber", "front", "back", "chapter", "tags", "premium", "difficulty"];

const validCandidate = {
  front: "Acceleration Clause",
  back: "A contractual term that makes the whole outstanding balance due immediately if the borrower defaults.",
  tags: ["definitions", "mortgage law"],
  difficulty: 2,
};

const newApprovedFlashcard = {
  chapter: 3,
  front: "New term",
  back: "Its definition.",
  tags: ["definitions", "land law"],
  difficulty: 1,
  premium: false,
  aiFlashcardId: "pendingFlashcard123",
};

describe("validateAiFlashcard", () => {
  it("accepts a valid flashcard", () => {
    assert.deepEqual(validateAiFlashcard(validCandidate), {valid: true, flashcard: validCandidate});
  });

  it("returns exactly the fields an admin can edit, under the flashcard key the approval reads", () => {
    assert.deepEqual(AI_FLASHCARD_EDITABLE_FIELD_NAMES, ["front", "back", "tags", "difficulty"]);
    assert.deepEqual(Object.keys(validateAiFlashcard(validCandidate).flashcard), AI_FLASHCARD_EDITABLE_FIELD_NAMES);
  });

  it("returns trimmed values, with tags lowercased and deduplicated after normalizing", () => {
    const result = validateAiFlashcard({
      front: "  Acceleration Clause \n",
      back: "\tA term. ",
      tags: [" Definitions ", "Mortgage Law", "definitions", "MORTGAGE LAW\n"],
      difficulty: 3,
    });
    assert.deepEqual(result, {
      valid: true,
      flashcard: {front: "Acceleration Clause", back: "A term.", tags: ["definitions", "mortgage law"], difficulty: 3},
    });
  });

  /**
   * Validates the valid candidate with some fields replaced and returns the errors.
   * @param {object} overrides - Fields to replace.
   * @return {Array<string>} The validation errors.
   */
  function errorsFor(overrides) {
    const result = validateAiFlashcard({...validCandidate, ...overrides});
    assert.equal(result.valid, false);
    assert.equal(result.flashcard, undefined);
    return result.errors;
  }

  it("rejects a missing, blank or too long front", () => {
    assert.deepEqual(errorsFor({front: undefined}), ["Front must be non-empty text"]);
    assert.deepEqual(errorsFor({front: "   "}), ["Front must be non-empty text"]);
    assert.deepEqual(errorsFor({front: 42}), ["Front must be non-empty text"]);
    assert.deepEqual(errorsFor({front: "f".repeat(101)}), ["Front must be at most 100 characters"]);
    assert.equal(validateAiFlashcard({...validCandidate, front: "f".repeat(100)}).valid, true);
    assert.equal(validateAiFlashcard({...validCandidate, front: ` ${"f".repeat(100)} `}).valid, true);
  });

  it("rejects a missing, blank or too long back", () => {
    assert.deepEqual(errorsFor({back: undefined}), ["Back must be non-empty text"]);
    assert.deepEqual(errorsFor({back: "\n"}), ["Back must be non-empty text"]);
    assert.deepEqual(errorsFor({back: ["text"]}), ["Back must be non-empty text"]);
    assert.deepEqual(errorsFor({back: "b".repeat(601)}), ["Back must be at most 600 characters"]);
    assert.equal(validateAiFlashcard({...validCandidate, back: "b".repeat(600)}).valid, true);
  });

  it("rejects tags that are not a list of 1 to 5 different tags", () => {
    const tagCountProblem = "There must be 1 to 5 different tags";
    for (const tags of [undefined, null, "definitions, land law", {0: "definitions"}, []]) {
      assert.deepEqual(errorsFor({tags}), [tagCountProblem]);
    }
    assert.deepEqual(errorsFor({tags: ["a", "b", "c", "d", "e", "f"]}), [tagCountProblem]);
    assert.equal(validateAiFlashcard({...validCandidate, tags: ["a", "b", "c", "d", "e"]}).valid, true);
  });

  it("counts tags after removing duplicates", () => {
    const result = validateAiFlashcard({...validCandidate, tags: ["a", "b", "c", "d", "e", "A", " b "]});
    assert.equal(result.valid, true);
    assert.deepEqual(result.flashcard.tags, ["a", "b", "c", "d", "e"]);
    assert.deepEqual(validateAiFlashcard({...validCandidate, tags: ["Same", "same"]}).flashcard.tags, ["same"]);
  });

  it("rejects blank, non-string and too long tags", () => {
    assert.deepEqual(errorsFor({tags: ["definitions", " "]}), ["Tag 2 must be non-empty text"]);
    assert.deepEqual(errorsFor({tags: [7, "definitions"]}), ["Tag 1 must be non-empty text"]);
    assert.deepEqual(errorsFor({tags: ["t".repeat(41)]}), ["Tag 1 must be at most 40 characters"]);
    assert.equal(validateAiFlashcard({...validCandidate, tags: ["t".repeat(40)]}).valid, true);
  });

  it("rejects a difficulty that is not an integer from 1 to 3", () => {
    for (const difficulty of [0, 4, 1.5, "2", null, undefined]) {
      assert.deepEqual(errorsFor({difficulty}), ["Difficulty must be an integer from 1 to 3"]);
    }
    for (const difficulty of [1, 2, 3]) {
      assert.equal(validateAiFlashcard({...validCandidate, difficulty}).valid, true);
    }
  });

  it("reports every problem at once", () => {
    assert.deepEqual(validateAiFlashcard(null).errors, [
      "Front must be non-empty text",
      "Back must be non-empty text",
      "There must be 1 to 5 different tags",
      "Difficulty must be an integer from 1 to 3",
    ]);
  });
});

describe("appendAiFlashcardToChapterFile", () => {
  it("numbers the first card of a new file 1", () => {
    const result = appendAiFlashcardToChapterFile([], newApprovedFlashcard);
    assert.equal(result.alreadyInRepo, false);
    assert.equal(result.cardNumber, 1);
    const [appendedEntry] = parseChapterFile(result.fileContent);
    assert.match(appendedEntry.documentID, UUID_PATTERN);
    assert.deepEqual(appendedEntry, {
      ...newApprovedFlashcard,
      documentID: appendedEntry.documentID,
      cardNumber: 1,
      aiGenerated: true,
    });
  });

  it("numbers the next card after the highest existing number", () => {
    const existingFlashcards = [1, 2, 3].map((cardNumber) => ({cardNumber, aiFlashcardId: `existing${cardNumber}`}));
    const result = appendAiFlashcardToChapterFile(existingFlashcards, newApprovedFlashcard);
    assert.equal(result.cardNumber, 4);
    assert.equal(parseChapterFile(result.fileContent).length, 4);
  });

  it("uses the highest number plus one when there are gaps", () => {
    const existingFlashcards = [{cardNumber: 7, aiFlashcardId: "a"}, {cardNumber: 2, aiFlashcardId: "b"}];
    assert.equal(appendAiFlashcardToChapterFile(existingFlashcards, newApprovedFlashcard).cardNumber, 8);
  });

  it("reports a card that is already in the file with its number and entry, without new content", () => {
    // As an earlier attempt committed it, before this retry's edits.
    const entryAlreadyInRepo = {...newApprovedFlashcard, documentID: "earlier-uuid", cardNumber: 5, front: "As first approved"};
    const existingFlashcards = [
      {cardNumber: 1, aiFlashcardId: "other"},
      entryAlreadyInRepo,
      {cardNumber: 6, aiFlashcardId: "another"},
    ];
    assert.deepEqual(appendAiFlashcardToChapterFile(existingFlashcards, newApprovedFlashcard), {
      alreadyInRepo: true,
      cardNumber: 5,
      entryAlreadyInRepo,
    });
  });

  it("appends the entry in the human flashcard key order plus the AI fields, without touching existing entries", () => {
    const existingEntry = {documentID: "old-uuid", cardNumber: 1, front: "Old", aiFlashcardId: "old"};
    const existingFlashcards = [existingEntry];
    const {fileContent} = appendAiFlashcardToChapterFile(existingFlashcards, {
      aiFlashcardId: "pendingFlashcard123",
      premium: true,
      difficulty: 2,
      tags: ["definitions"],
      back: "Reordered.",
      front: "Reordered",
      chapter: 3,
    });
    const parsedFile = parseChapterFile(fileContent);
    assert.deepEqual(parsedFile[0], existingEntry);
    assert.deepEqual(Object.keys(parsedFile[1]), [...HUMAN_FLASHCARD_KEY_ORDER, "aiGenerated", "aiFlashcardId"]);
    assert.equal(parsedFile[1].aiGenerated, true);
    assert.equal(existingFlashcards.length, 1);
  });

  it("gives every appended card its own UUID documentID", () => {
    const firstDocumentId = parseChapterFile(appendAiFlashcardToChapterFile([], newApprovedFlashcard).fileContent)[0].documentID;
    const secondDocumentId = parseChapterFile(appendAiFlashcardToChapterFile([], newApprovedFlashcard).fileContent)[0].documentID;
    assert.match(firstDocumentId, UUID_PATTERN);
    assert.match(secondDocumentId, UUID_PATTERN);
    assert.notEqual(firstDocumentId, secondDocumentId);
  });

  it("serializes with 2-space indentation and a trailing newline", () => {
    const {fileContent} = appendAiFlashcardToChapterFile([], newApprovedFlashcard);
    assert.ok(fileContent.startsWith("[\n  {\n    \"documentID\": \""));
    assert.ok(fileContent.includes("\",\n    \"cardNumber\": 1,\n"));
    assert.ok(fileContent.endsWith("}\n]\n"));
  });

  it("throws without an aiFlashcardId so it can never match an entry that has none", () => {
    assert.throws(
        () => appendAiFlashcardToChapterFile([{cardNumber: 1}], {...newApprovedFlashcard, aiFlashcardId: undefined}),
        /aiFlashcardId/,
    );
  });
});

describe("normalizeAiFlashcardDocs", () => {
  const fileEntry = {
    documentID: "f1c1a8b0-1d92-4e3a-8c6f-2aa3f4b9e1f1",
    cardNumber: 2,
    front: "Term",
    back: "Definition.",
    chapter: 3,
    tags: ["definitions"],
    premium: false,
    difficulty: 2,
    aiGenerated: true,
    aiFlashcardId: "pendingFlashcard123",
  };

  it("maps file entries to flashcardsAi documents", () => {
    assert.deepEqual(normalizeAiFlashcardDocs([fileEntry], 3), [fileEntry]);
  });

  it("always stamps aiGenerated true and the chapter being imported", () => {
    const [flashcardDoc] = normalizeAiFlashcardDocs([{...fileEntry, chapter: 9, aiGenerated: false}], 3);
    assert.equal(flashcardDoc.chapter, 3);
    assert.equal(flashcardDoc.aiGenerated, true);
  });

  it("defaults premium to true unless the file says false", () => {
    const [missingPremium, falsePremium, stringPremium] = normalizeAiFlashcardDocs([
      {...fileEntry, premium: undefined},
      {...fileEntry, premium: false},
      {...fileEntry, premium: "no"},
    ], 3);
    assert.equal(missingPremium.premium, true);
    assert.equal(falsePremium.premium, false);
    assert.equal(stringPremium.premium, true);
  });

  it("falls back to a chapter and number based aiFlashcardId for cards added by hand", () => {
    const flashcardDocs = normalizeAiFlashcardDocs([
      {...fileEntry, aiFlashcardId: undefined, cardNumber: 4},
      {...fileEntry, aiFlashcardId: "", cardNumber: 5},
      {...fileEntry, aiFlashcardId: 12, cardNumber: "6"},
    ], 3);
    assert.deepEqual(flashcardDocs.map((flashcardDoc) => flashcardDoc.aiFlashcardId), [
      "chapter3_card4",
      "chapter3_card5",
      "chapter3_card6",
    ]);
    assert.equal(flashcardDocs[2].cardNumber, 6);
  });

  it("stores a null documentID for cards added by hand without one", () => {
    for (const documentID of [undefined, "", 7]) {
      const [flashcardDoc] = normalizeAiFlashcardDocs([{...fileEntry, documentID}], 3);
      assert.equal(flashcardDoc.documentID, null);
    }
  });

  it("drops fields that are not part of a flashcardsAi document", () => {
    const [flashcardDoc] = normalizeAiFlashcardDocs([{...fileEntry, notes: "hand edit"}], 3);
    assert.equal(flashcardDoc.notes, undefined);
  });

  it("throws when an entry is not an object", () => {
    for (const invalidEntry of [null, "flashcard", 7, [fileEntry]]) {
      assert.throws(() => normalizeAiFlashcardDocs([fileEntry, invalidEntry], 3), {message: "Entry 2 is not an object"});
    }
  });

  it("throws naming the entry and its cardNumber when a field the app needs is malformed", () => {
    const malformedFieldCases = [
      [{front: undefined}, "front must be a non-empty string"],
      [{front: "  "}, "front must be a non-empty string"],
      [{front: 7}, "front must be a non-empty string"],
      [{back: undefined}, "back must be a non-empty string"],
      [{back: "\n"}, "back must be a non-empty string"],
      [{back: ["Definition."]}, "back must be a non-empty string"],
      [{tags: undefined}, "tags must be an array of strings"],
      [{tags: "definitions"}, "tags must be an array of strings"],
      [{tags: [1]}, "tags must be an array of strings"],
      [{tags: ["definitions", null]}, "tags must be an array of strings"],
      [{difficulty: undefined}, "difficulty must be an integer from 1 to 3"],
      [{difficulty: 0}, "difficulty must be an integer from 1 to 3"],
      [{difficulty: 4}, "difficulty must be an integer from 1 to 3"],
      [{difficulty: 1.5}, "difficulty must be an integer from 1 to 3"],
      [{difficulty: "2"}, "difficulty must be an integer from 1 to 3"],
    ];
    for (const [malformedFields, expectedProblem] of malformedFieldCases) {
      assert.throws(
          () => normalizeAiFlashcardDocs([fileEntry, {...fileEntry, cardNumber: 5, ...malformedFields}], 3),
          {message: `Entry 2 (cardNumber 5): ${expectedProblem}`},
      );
    }
  });

  it("leaves the cardNumber out of the message when it is not a positive integer", () => {
    for (const cardNumber of [undefined, null, "", "abc", 0, -2, 1.5]) {
      assert.throws(
          () => normalizeAiFlashcardDocs([{...fileEntry, cardNumber}], 3),
          {message: "Entry 1: cardNumber must be a positive integer"},
      );
    }
  });

  it("lists every problem of the invalid entry", () => {
    assert.throws(() => normalizeAiFlashcardDocs([{cardNumber: 4, premium: false}], 3), {
      message: "Entry 1 (cardNumber 4): front must be a non-empty string; back must be a non-empty string; " +
        "tags must be an array of strings; difficulty must be an integer from 1 to 3",
    });
  });

  it("does not apply the authoring rules to entries already in the file", () => {
    const entryBreakingAuthoringRules = {
      ...fileEntry,
      front: "f".repeat(101),
      back: "b".repeat(601),
      tags: ["Upper", "Upper", "", "t".repeat(41), "a", "b"],
    };
    assert.deepEqual(normalizeAiFlashcardDocs([entryBreakingAuthoringRules], 3), [entryBreakingAuthoringRules]);
    assert.deepEqual(normalizeAiFlashcardDocs([{...fileEntry, tags: []}], 3)[0].tags, []);
  });

  it("accepts a file an approval wrote", () => {
    const {fileContent} = appendAiFlashcardToChapterFile([{...fileEntry, aiFlashcardId: "earlier"}], newApprovedFlashcard);
    const flashcardDocs = normalizeAiFlashcardDocs(parseChapterFile(fileContent), 3);
    assert.match(flashcardDocs[1].documentID, UUID_PATTERN);
    assert.deepEqual(flashcardDocs[1], {
      ...newApprovedFlashcard,
      documentID: flashcardDocs[1].documentID,
      cardNumber: 3,
      aiGenerated: true,
    });
  });

  it("refuses a file with a hand-edited entry missing its back, even after a valid card is appended", () => {
    const entryWithoutBack = {...fileEntry, aiFlashcardId: "handEdited"};
    delete entryWithoutBack.back;
    const {fileContent} = appendAiFlashcardToChapterFile([entryWithoutBack], newApprovedFlashcard);
    assert.throws(
        () => normalizeAiFlashcardDocs(parseChapterFile(fileContent), 3),
        {message: "Entry 1 (cardNumber 2): back must be a non-empty string"},
    );
  });
});
