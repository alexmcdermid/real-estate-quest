// Pure helpers shared by the AI question and AI flashcard flows (see docs/ai-question-flow.md).
// No Firebase imports, so everything here can be unit tested with `node --test`.
import crypto from "crypto";

export const CONTENT_SOURCES = ["mixed", "human", "ai"];

// Each is also the AI repo folder of its chapter files and the contentType of its generationRuns.
export const AI_CONTENT_TYPE_NAMES = ["questions", "flashcards"];

export const MIN_AI_ITEMS_PER_RUN = 1;
export const MAX_AI_ITEMS_PER_RUN = 10;

/**
 * Picks the content source a request is served from, for questions and flashcards alike.
 * The frontend implements the same rule.
 *
 * @param {object} params
 * @param {boolean} params.aiContentServed - Whether the admin switched AI content serving on.
 * @param {boolean} params.isPro - Whether the caller is a pro member.
 * @param {string} [params.requestedContentSource] - The source the caller asked for.
 * @return {string} "mixed", "human" or "ai".
 */
export function resolveContentSource({aiContentServed, isPro, requestedContentSource}) {
  if (!aiContentServed) return "human"; // serving off: human content only
  if (!isPro) return "mixed"; // free users get no choice
  return CONTENT_SOURCES.includes(requestedContentSource) ? requestedContentSource : "mixed";
}

/**
 * Reads the contentSource a client sent. Not sending one means "mixed".
 *
 * @param {any} value - The contentSource from the request.
 * @return {string} A value from CONTENT_SOURCES.
 * @throws {Error} When the value is not one of CONTENT_SOURCES.
 */
export function parseRequestedContentSource(value) {
  if (value === undefined || value === null) return "mixed";
  if (CONTENT_SOURCES.includes(value)) return value;
  throw new Error(`contentSource must be one of: ${CONTENT_SOURCES.join(", ")}`);
}

/**
 * Reads a per-run item count setting as an integer from MIN_AI_ITEMS_PER_RUN to MAX_AI_ITEMS_PER_RUN.
 *
 * @param {any} value - The stored value (anything; missing or unreadable means the minimum).
 * @return {number} The clamped count.
 */
function clampAiItemsPerRun(value) {
  const parsedItemsPerRun = Number(value);
  return Number.isFinite(parsedItemsPerRun) ?
    Math.min(MAX_AI_ITEMS_PER_RUN, Math.max(MIN_AI_ITEMS_PER_RUN, Math.trunc(parsedItemsPerRun))) :
    MIN_AI_ITEMS_PER_RUN;
}

/**
 * Applies defaults to the metadata/aiContent document.
 *
 * @param {object} [data] - The document data (undefined when the document is missing).
 * @return {{generationEnabled: boolean, servingEnabled: boolean, questionsPerRun: number, flashcardsPerRun: number}}
 *   The settings.
 */
export function normalizeAiSettings(data) {
  return {
    generationEnabled: data?.generationEnabled === true,
    servingEnabled: data?.servingEnabled === true,
    questionsPerRun: clampAiItemsPerRun(data?.questionsPerRun),
    flashcardsPerRun: clampAiItemsPerRun(data?.flashcardsPerRun),
  };
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
 * Parses a chapter file (a JSON array; the human repo's <chapter>.js files use the same format).
 *
 * @param {string} content - The decoded file content.
 * @return {Array} The parsed entries.
 * @throws {Error} When the content is not JSON or not an array.
 */
export function parseChapterFile(content) {
  const parsedContent = JSON.parse(content);
  if (!Array.isArray(parsedContent)) {
    throw new Error("A chapter file must contain a JSON array");
  }
  return parsedContent;
}

/**
 * Serializes an AI chapter file the way the AI repo stores it.
 *
 * @param {Array} entries - The chapter's questions or flashcards.
 * @return {string} Pretty-printed JSON with a trailing newline.
 */
export function serializeAiChapterFile(entries) {
  return JSON.stringify(entries, null, 2) + "\n";
}

/**
 * Builds the path of a chapter file in the AI repo.
 *
 * @param {string} contentTypeName - "questions" or "flashcards".
 * @param {number} chapter - The chapter number.
 * @return {string} For example "questions/3.json".
 * @throws {Error} When contentTypeName is not one of AI_CONTENT_TYPE_NAMES.
 */
export function buildAiChapterFilePath(contentTypeName, chapter) {
  if (!AI_CONTENT_TYPE_NAMES.includes(contentTypeName)) {
    throw new Error(`contentTypeName must be one of: ${AI_CONTENT_TYPE_NAMES.join(", ")}`);
  }
  return `${contentTypeName}/${chapter}.json`;
}

/**
 * Checks for a string with something other than whitespace in it.
 *
 * @param {any} value - The value to check.
 * @return {boolean} Whether the value is non-empty text.
 */
export function isNonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Appends an approved AI question or flashcard to a chapter file, unless an entry with the same AI id is already
 * there (an earlier attempt that committed but did not finish). Items are numbered within the AI file:
 * the highest existing number + 1.
 *
 * @param {object} params
 * @param {Array} params.existingEntries - The parsed chapter file ([] when the file does not exist yet).
 * @param {string} params.itemNumberFieldName - "questionNumber" or "cardNumber".
 * @param {string} params.aiIdFieldName - "aiQuestionId" or "aiFlashcardId".
 * @param {string} params.newEntryAiId - The new entry's AI id (its pending document id).
 * @param {function(number): object} params.buildNewEntry - Builds the new entry, in file key order, for its number.
 * @return {object} {alreadyInRepo: true, <itemNumberFieldName>, entryAlreadyInRepo (the entry as it is in the file)}
 *   or {alreadyInRepo: false, <itemNumberFieldName>, fileContent}.
 */
export function appendAiEntryToChapterFile({existingEntries, itemNumberFieldName, aiIdFieldName, newEntryAiId, buildNewEntry}) {
  // Without an id the new entry could match an entry that has none.
  if (typeof newEntryAiId !== "string" || newEntryAiId === "") {
    throw new Error(`${aiIdFieldName} must be a non-empty string`);
  }

  const entryAlreadyInRepo = existingEntries.find((entry) => entry?.[aiIdFieldName] === newEntryAiId);
  if (entryAlreadyInRepo) {
    return {alreadyInRepo: true, [itemNumberFieldName]: Number(entryAlreadyInRepo[itemNumberFieldName]), entryAlreadyInRepo};
  }

  const existingItemNumbers = existingEntries
      .map((entry) => Number(entry?.[itemNumberFieldName]))
      .filter((itemNumber) => Number.isFinite(itemNumber));
  const itemNumber = Math.max(0, ...existingItemNumbers) + 1;

  return {
    alreadyInRepo: false,
    [itemNumberFieldName]: itemNumber,
    fileContent: serializeAiChapterFile([...existingEntries, buildNewEntry(itemNumber)]),
  };
}

/**
 * Turns a parsed AI chapter file into live documents, after checking that every entry has the shape the app needs
 * to show it (a hand edit on GitHub can break one). These are shape checks only: the authoring rules an approval
 * applies are not applied to entries already in the file.
 *
 * @param {object} params
 * @param {Array} params.parsedFileArray - The parsed chapter file.
 * @param {string} params.itemNumberFieldName - "questionNumber" or "cardNumber"; must be a positive integer.
 * @param {function(object): Array<string>} params.findEntryShapeProblems - The entry's other shape problems.
 * @param {function(object, number): object} params.buildLiveDoc - Builds the document from a valid entry and its number.
 * @return {Array<object>} The live documents.
 * @throws {Error} Naming the first invalid entry (its position, and its number when that is valid).
 */
export function normalizeAiChapterEntries({parsedFileArray, itemNumberFieldName, findEntryShapeProblems, buildLiveDoc}) {
  return parsedFileArray.map((entry, entryIndex) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Entry ${entryIndex + 1} is not an object`);
    }

    const itemNumber = Number(entry[itemNumberFieldName]);
    const itemNumberIsValid = Number.isInteger(itemNumber) && itemNumber > 0;
    const shapeProblems = [
      ...(itemNumberIsValid ? [] : [`${itemNumberFieldName} must be a positive integer`]),
      ...findEntryShapeProblems(entry),
    ];
    if (shapeProblems.length > 0) {
      const entryLabel = itemNumberIsValid ?
        `Entry ${entryIndex + 1} (${itemNumberFieldName} ${itemNumber})` :
        `Entry ${entryIndex + 1}`;
      throw new Error(`${entryLabel}: ${shapeProblems.join("; ")}`);
    }

    return buildLiveDoc(entry, itemNumber);
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
