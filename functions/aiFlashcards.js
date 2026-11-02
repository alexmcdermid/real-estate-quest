// Pure helpers for AI flashcards (see docs/ai-question-flow.md). The helpers shared with AI questions are in
// aiContent.js. No Firebase imports, so everything here can be unit tested with `node --test`.
import crypto from "crypto";
import {appendAiEntryToChapterFile, isNonEmptyText, normalizeAiChapterEntries} from "./aiContent.js";

// The fields an admin can edit before approving, which are the ones validateAiFlashcard checks.
export const AI_FLASHCARD_EDITABLE_FIELD_NAMES = ["front", "back", "tags", "difficulty"];

const MAX_FRONT_LENGTH = 100; // the longest human front is 43 characters
const MAX_BACK_LENGTH = 600; // the longest human back is 326 characters
const MIN_TAG_COUNT = 1;
const MAX_TAG_COUNT = 5;
const MAX_TAG_LENGTH = 40;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 3;

/**
 * Checks for a flashcard difficulty: an integer from MIN_DIFFICULTY to MAX_DIFFICULTY.
 *
 * @param {any} value - The value to check.
 * @return {boolean} Whether the value is a valid difficulty.
 */
function isFlashcardDifficulty(value) {
  return Number.isInteger(value) && value >= MIN_DIFFICULTY && value <= MAX_DIFFICULTY;
}

/**
 * Validates an AI flashcard (the generator applies the same rules). Values are trimmed first, tags are also
 * lowercased and deduplicated, and those values are the ones to store.
 *
 * @param {object} candidate - {front, back, tags, difficulty}.
 * @return {object} {valid: true, flashcard: {front, back, tags, difficulty}} or {valid: false, errors: string[]}.
 */
export function validateAiFlashcard(candidate) {
  const errors = [];

  const front = typeof candidate?.front === "string" ? candidate.front.trim() : "";
  if (front === "") {
    errors.push("Front must be non-empty text");
  } else if (front.length > MAX_FRONT_LENGTH) {
    errors.push(`Front must be at most ${MAX_FRONT_LENGTH} characters`);
  }

  const back = typeof candidate?.back === "string" ? candidate.back.trim() : "";
  if (back === "") {
    errors.push("Back must be non-empty text");
  } else if (back.length > MAX_BACK_LENGTH) {
    errors.push(`Back must be at most ${MAX_BACK_LENGTH} characters`);
  }

  const tagCountProblem = `There must be ${MIN_TAG_COUNT} to ${MAX_TAG_COUNT} different tags`;
  let tags = [];
  if (!Array.isArray(candidate?.tags)) {
    errors.push(tagCountProblem);
  } else {
    const normalizedTags = candidate.tags.map((tag) => typeof tag === "string" ? tag.trim().toLowerCase() : "");
    normalizedTags.forEach((tag, tagIndex) => {
      if (tag === "") {
        errors.push(`Tag ${tagIndex + 1} must be non-empty text`);
      } else if (tag.length > MAX_TAG_LENGTH) {
        errors.push(`Tag ${tagIndex + 1} must be at most ${MAX_TAG_LENGTH} characters`);
      }
    });
    // Counted after removing duplicates, since the deduplicated list is what gets stored.
    tags = [...new Set(normalizedTags)];
    if (tags.length < MIN_TAG_COUNT || tags.length > MAX_TAG_COUNT) {
      errors.push(tagCountProblem);
    }
  }

  const difficulty = candidate?.difficulty;
  if (!isFlashcardDifficulty(difficulty)) {
    errors.push(`Difficulty must be an integer from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}`);
  }

  if (errors.length > 0) return {valid: false, errors};
  return {valid: true, flashcard: {front, back, tags, difficulty}};
}

/**
 * Appends an approved flashcard to its chapter file (flashcards/<chapter>.json), unless a flashcard with the same
 * aiFlashcardId is already there (an earlier attempt that committed but did not finish).
 *
 * @param {Array} existingFlashcards - The parsed chapter file ([] when the file does not exist yet).
 * @param {object} newFlashcard - {chapter, front, back, tags, difficulty, premium, aiFlashcardId}.
 * @return {object} {alreadyInRepo: true, cardNumber, entryAlreadyInRepo (the entry as it is in the file)}
 *   or {alreadyInRepo: false, cardNumber, fileContent}.
 */
export function appendAiFlashcardToChapterFile(existingFlashcards, newFlashcard) {
  return appendAiEntryToChapterFile({
    existingEntries: existingFlashcards,
    itemNumberFieldName: "cardNumber",
    aiIdFieldName: "aiFlashcardId",
    newEntryAiId: newFlashcard.aiFlashcardId,
    // Same fields and key order as the human flashcards file, plus the AI flag and id.
    buildNewEntry: (cardNumber) => ({
      documentID: crypto.randomUUID(), // every human flashcard carries its own UUID too
      cardNumber,
      front: newFlashcard.front,
      back: newFlashcard.back,
      chapter: newFlashcard.chapter,
      tags: newFlashcard.tags,
      premium: newFlashcard.premium,
      difficulty: newFlashcard.difficulty,
      aiGenerated: true,
      aiFlashcardId: newFlashcard.aiFlashcardId,
    }),
  });
}

/**
 * Lists what keeps a flashcard file entry from being shown (its cardNumber is checked separately).
 *
 * @param {object} entry - A chapter file entry.
 * @return {Array<string>} The problems, empty when the entry is fine.
 */
function findAiFlashcardEntryShapeProblems(entry) {
  const shapeProblems = [];
  if (!isNonEmptyText(entry.front)) shapeProblems.push("front must be a non-empty string");
  if (!isNonEmptyText(entry.back)) shapeProblems.push("back must be a non-empty string");
  if (!Array.isArray(entry.tags) || !entry.tags.every((tag) => typeof tag === "string")) {
    shapeProblems.push("tags must be an array of strings");
  }
  if (!isFlashcardDifficulty(entry.difficulty)) {
    shapeProblems.push(`difficulty must be an integer from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}`);
  }
  return shapeProblems;
}

/**
 * Turns a parsed AI flashcard chapter file into flashcardsAi documents. The chapter and aiGenerated flag are always
 * stamped here rather than trusted from the file.
 *
 * @param {Array} parsedFileArray - The parsed chapter file.
 * @param {number} chapter - The chapter the file belongs to.
 * @return {Array<object>} The documents to write to flashcardsAi.
 * @throws {Error} Naming the first invalid entry (its position, and its cardNumber when that is valid).
 */
export function normalizeAiFlashcardDocs(parsedFileArray, chapter) {
  return normalizeAiChapterEntries({
    parsedFileArray,
    itemNumberFieldName: "cardNumber",
    findEntryShapeProblems: findAiFlashcardEntryShapeProblems,
    buildLiveDoc: (entry, cardNumber) => ({
      // A flashcard added by hand on GitHub may have no documentID or aiFlashcardId.
      documentID: typeof entry.documentID === "string" && entry.documentID !== "" ? entry.documentID : null,
      cardNumber,
      front: entry.front,
      back: entry.back,
      chapter,
      tags: entry.tags,
      premium: entry.premium !== false,
      difficulty: entry.difficulty,
      aiGenerated: true,
      aiFlashcardId: typeof entry.aiFlashcardId === "string" && entry.aiFlashcardId !== "" ?
        entry.aiFlashcardId :
        `chapter${chapter}_card${cardNumber}`,
    }),
  });
}
