import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_SOURCES,
  AI_CONTENT_TYPE_NAMES,
  resolveContentSource,
  parseRequestedContentSource,
  normalizeAiSettings,
  computeContentHash,
  parseChapterFile,
  serializeAiChapterFile,
  buildAiChapterFilePath,
  isNonEmptyText,
  appendAiEntryToChapterFile,
  normalizeAiChapterEntries,
  timestampToIso,
} from "../aiContent.js";

describe("resolveContentSource", () => {
  it("serves human content only while AI serving is off, whatever was requested", () => {
    for (const isPro of [true, false]) {
      for (const requestedContentSource of [...CONTENT_SOURCES, undefined, null, "bogus"]) {
        assert.equal(resolveContentSource({aiContentServed: false, isPro, requestedContentSource}), "human");
      }
    }
  });

  it("gives free users mixed content with no choice", () => {
    for (const requestedContentSource of [...CONTENT_SOURCES, undefined, null, "bogus"]) {
      assert.equal(resolveContentSource({aiContentServed: true, isPro: false, requestedContentSource}), "mixed");
    }
  });

  it("gives pro users the source they asked for, defaulting to mixed", () => {
    for (const requestedContentSource of CONTENT_SOURCES) {
      assert.equal(
          resolveContentSource({aiContentServed: true, isPro: true, requestedContentSource}),
          requestedContentSource,
      );
    }
    for (const requestedContentSource of [undefined, null, "bogus", "AI"]) {
      assert.equal(resolveContentSource({aiContentServed: true, isPro: true, requestedContentSource}), "mixed");
    }
  });
});

describe("parseRequestedContentSource", () => {
  it("defaults to mixed when no source is sent", () => {
    assert.equal(parseRequestedContentSource(undefined), "mixed");
    assert.equal(parseRequestedContentSource(null), "mixed");
  });

  it("returns valid sources unchanged", () => {
    for (const contentSource of CONTENT_SOURCES) {
      assert.equal(parseRequestedContentSource(contentSource), contentSource);
    }
  });

  it("throws for anything else", () => {
    for (const invalidContentSource of ["", "AI", "both", 1, true, {}, []]) {
      assert.throws(() => parseRequestedContentSource(invalidContentSource), /contentSource must be one of/);
    }
  });
});

describe("normalizeAiSettings", () => {
  it("defaults everything off with one question and one flashcard per run when the document is missing or empty", () => {
    const defaultSettings = {generationEnabled: false, servingEnabled: false, questionsPerRun: 1, flashcardsPerRun: 1};
    assert.deepEqual(normalizeAiSettings(undefined), defaultSettings);
    assert.deepEqual(normalizeAiSettings(null), defaultSettings);
    assert.deepEqual(normalizeAiSettings({}), defaultSettings);
  });

  it("only treats the boolean true as enabled", () => {
    assert.deepEqual(
        normalizeAiSettings({generationEnabled: true, servingEnabled: true, questionsPerRun: 5, flashcardsPerRun: 7}),
        {generationEnabled: true, servingEnabled: true, questionsPerRun: 5, flashcardsPerRun: 7},
    );
    const truthyNonBooleans = normalizeAiSettings({generationEnabled: "true", servingEnabled: 1});
    assert.equal(truthyNonBooleans.generationEnabled, false);
    assert.equal(truthyNonBooleans.servingEnabled, false);
  });

  it("clamps questionsPerRun and flashcardsPerRun to an integer from 1 to 10", () => {
    for (const perRunSettingName of ["questionsPerRun", "flashcardsPerRun"]) {
      const clampedCount = (value) => normalizeAiSettings({[perRunSettingName]: value})[perRunSettingName];
      assert.equal(clampedCount(0), 1);
      assert.equal(clampedCount(-4), 1);
      assert.equal(clampedCount(11), 10);
      assert.equal(clampedCount(1000), 10);
      assert.equal(clampedCount(3.7), 3);
      assert.equal(clampedCount("4"), 4);
      assert.equal(clampedCount("many"), 1);
      assert.equal(clampedCount(Number.NaN), 1);
      assert.equal(clampedCount(Infinity), 1);
    }
  });

  it("reads the two per-run counts independently", () => {
    assert.deepEqual(normalizeAiSettings({questionsPerRun: 4}), {
      generationEnabled: false, servingEnabled: false, questionsPerRun: 4, flashcardsPerRun: 1,
    });
    assert.deepEqual(normalizeAiSettings({flashcardsPerRun: 6}), {
      generationEnabled: false, servingEnabled: false, questionsPerRun: 1, flashcardsPerRun: 6,
    });
  });

  it("drops fields that are not settings", () => {
    assert.deepEqual(Object.keys(normalizeAiSettings({questionsPerRun: 2, legacyField: true})), [
      "generationEnabled", "servingEnabled", "questionsPerRun", "flashcardsPerRun",
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

describe("buildAiChapterFilePath", () => {
  it("puts each content type's chapter files in its own folder", () => {
    assert.deepEqual(AI_CONTENT_TYPE_NAMES, ["questions", "flashcards"]);
    assert.equal(buildAiChapterFilePath("questions", 3), "questions/3.json");
    assert.equal(buildAiChapterFilePath("flashcards", 20), "flashcards/20.json");
  });

  it("throws for an unknown content type rather than writing to a folder nothing imports", () => {
    for (const unknownContentTypeName of ["question", "Flashcards", "", undefined]) {
      assert.throws(() => buildAiChapterFilePath(unknownContentTypeName, 3), /contentTypeName must be one of/);
    }
  });
});

describe("isNonEmptyText", () => {
  it("accepts strings with something other than whitespace", () => {
    assert.equal(isNonEmptyText("a"), true);
    assert.equal(isNonEmptyText("  a \n"), true);
  });

  it("rejects blank strings and non-strings", () => {
    for (const value of ["", "   ", "\n\t", null, undefined, 0, 1, [], {}, ["a"]]) {
      assert.equal(isNonEmptyText(value), false);
    }
  });
});

describe("appendAiEntryToChapterFile", () => {
  /**
   * Appends an entry with the generic helper, numbering it with the given field.
   * @param {Array} existingEntries - The parsed chapter file.
   * @param {string} newEntryAiId - The new entry's AI id.
   * @return {object} The append result.
   */
  function appendEntry(existingEntries, newEntryAiId) {
    return appendAiEntryToChapterFile({
      existingEntries,
      itemNumberFieldName: "itemNumber",
      aiIdFieldName: "aiItemId",
      newEntryAiId,
      buildNewEntry: (itemNumber) => ({label: "new", itemNumber, aiItemId: newEntryAiId}),
    });
  }

  it("numbers the first entry of a new file 1 and serializes it with the builder's key order", () => {
    const result = appendEntry([], "newItem");
    assert.deepEqual(result, {
      alreadyInRepo: false,
      itemNumber: 1,
      fileContent: serializeAiChapterFile([{label: "new", itemNumber: 1, aiItemId: "newItem"}]),
    });
    assert.deepEqual(Object.keys(parseChapterFile(result.fileContent)[0]), ["label", "itemNumber", "aiItemId"]);
  });

  it("numbers after the highest existing number, ignoring gaps and unreadable numbers", () => {
    const existingEntries = [{itemNumber: 7, aiItemId: "a"}, {itemNumber: 2, aiItemId: "b"}, {itemNumber: "x"}, null];
    const result = appendEntry(existingEntries, "newItem");
    assert.equal(result.itemNumber, 8);
    assert.equal(parseChapterFile(result.fileContent).length, 5);
    assert.equal(existingEntries.length, 4);
  });

  it("returns the entry already in the file without calling the builder", () => {
    const entryAlreadyInRepo = {itemNumber: "5", aiItemId: "newItem", label: "as first approved"};
    const result = appendAiEntryToChapterFile({
      existingEntries: [{itemNumber: 1, aiItemId: "other"}, entryAlreadyInRepo],
      itemNumberFieldName: "itemNumber",
      aiIdFieldName: "aiItemId",
      newEntryAiId: "newItem",
      buildNewEntry: () => assert.fail("the builder must not run for an entry already in the file"),
    });
    assert.deepEqual(result, {alreadyInRepo: true, itemNumber: 5, entryAlreadyInRepo});
  });

  it("throws without an AI id, naming the id field", () => {
    for (const missingAiId of [undefined, null, "", 12]) {
      assert.throws(() => appendEntry([{itemNumber: 1}], missingAiId), {message: "aiItemId must be a non-empty string"});
    }
  });
});

describe("normalizeAiChapterEntries", () => {
  /**
   * Normalizes entries with the generic helper: entries need a non-empty label.
   * @param {Array} parsedFileArray - The parsed chapter file.
   * @return {Array<object>} The live documents.
   */
  function normalizeEntries(parsedFileArray) {
    return normalizeAiChapterEntries({
      parsedFileArray,
      itemNumberFieldName: "itemNumber",
      findEntryShapeProblems: (entry) => isNonEmptyText(entry.label) ? [] : ["label must be a non-empty string"],
      buildLiveDoc: (entry, itemNumber) => ({label: entry.label, itemNumber}),
    });
  }

  it("builds a document per entry, passing the entry and its number as a number", () => {
    assert.deepEqual(normalizeEntries([{label: "a", itemNumber: 1}, {label: "b", itemNumber: "2", extra: true}]), [
      {label: "a", itemNumber: 1},
      {label: "b", itemNumber: 2},
    ]);
  });

  it("throws when an entry is not an object", () => {
    for (const invalidEntry of [null, "entry", 7, [{label: "a", itemNumber: 1}]]) {
      assert.throws(() => normalizeEntries([{label: "a", itemNumber: 1}, invalidEntry]), {
        message: "Entry 2 is not an object",
      });
    }
  });

  it("names the entry and its number, and lists the number problem before the others", () => {
    assert.throws(() => normalizeEntries([{label: " ", itemNumber: 3}]), {
      message: "Entry 1 (itemNumber 3): label must be a non-empty string",
    });
    assert.throws(() => normalizeEntries([{label: "a", itemNumber: 1}, {itemNumber: 0}]), {
      message: "Entry 2: itemNumber must be a positive integer; label must be a non-empty string",
    });
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
