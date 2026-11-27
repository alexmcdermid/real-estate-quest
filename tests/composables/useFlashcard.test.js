import { describe, it, expect, beforeEach, vi } from "vitest";
import { CACHE_KEY } from "../../src/config/constants";
import { httpsCallable } from "firebase/functions";

const mockCallable = vi.fn();

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => mockCallable),
}));

vi.mock("../../src/config/firebaseConfig", () => ({
  firebaseApp: {},
}));

vi.mock("../../src/composables/useRateLimitBanner", () => ({
  showRateLimitBanner: vi.fn(),
}));

vi.mock("../../src/composables/useNotifier", () => ({
  showNotification: vi.fn(),
}));

import { fetchFlashcardsByChapter, flashcardsCacheKey } from "../../src/composables/useFlashcard";
import { decodeCache, encodeCache } from "../../src/composables/useQuestion";

describe("useFlashcard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("flashcardsCacheKey includes the source and the chapter", () => {
    expect(flashcardsCacheKey("ai", 3)).toBe("flashcards_ai_3");
    expect(flashcardsCacheKey("mixed", "12")).toBe("flashcards_mixed_12");
  });

  it("fetchFlashcardsByChapter caches and reuses flashcards", async () => {
    const flashcards = [{ id: "f1" }];
    mockCallable.mockResolvedValue({ data: { flashcards } });

    const first = await fetchFlashcardsByChapter(1);
    expect(first).toEqual(flashcards);
    expect(httpsCallable).toHaveBeenCalledTimes(1);
    expect(mockCallable).toHaveBeenCalledTimes(1);
    // No source given: the default is sent
    expect(mockCallable).toHaveBeenCalledWith({ chapter: 1, contentSource: "mixed" });

    const second = await fetchFlashcardsByChapter(1);
    expect(second).toEqual(flashcards);
    expect(mockCallable).toHaveBeenCalledTimes(1); // From cache

    const stored = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(stored.flashcards_mixed_1.flashcards).toEqual(flashcards);
  });

  it("fetchFlashcardsByChapter sends the source and caches each source separately", async () => {
    const aiFlashcards = [{ id: "ai1", aiGenerated: true, aiFlashcardId: "pending1" }];
    const humanFlashcards = [{ id: "h1" }];
    mockCallable
      .mockResolvedValueOnce({ data: { flashcards: aiFlashcards, contentSource: "ai" } })
      .mockResolvedValueOnce({ data: { flashcards: humanFlashcards, contentSource: "human" } });

    expect(await fetchFlashcardsByChapter(4, "ai")).toEqual(aiFlashcards);
    expect(mockCallable).toHaveBeenLastCalledWith({ chapter: 4, contentSource: "ai" });

    // A different source for the same chapter is not served from the AI entry
    expect(await fetchFlashcardsByChapter(4, "human")).toEqual(humanFlashcards);
    expect(mockCallable).toHaveBeenLastCalledWith({ chapter: 4, contentSource: "human" });
    expect(mockCallable).toHaveBeenCalledTimes(2);

    const stored = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(stored.flashcards_ai_4.flashcards).toEqual(aiFlashcards);
    expect(stored.flashcards_human_4.flashcards).toEqual(humanFlashcards);

    // Both are now served from the cache
    expect(await fetchFlashcardsByChapter(4, "ai")).toEqual(aiFlashcards);
    expect(await fetchFlashcardsByChapter(4, "human")).toEqual(humanFlashcards);
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it("does not undo a cache clear that happens while the request is in flight", async () => {
    localStorage.setItem(CACHE_KEY, encodeCache({
      contentVersion: 1,
      questions_mixed_1: { timestamp: Date.now(), questions: [{ id: "stale" }] },
    }));
    const flashcards = [{ id: "f1" }];
    mockCallable.mockImplementation(async () => {
      // The content version check clears the cache and stores the new version meanwhile
      localStorage.setItem(CACHE_KEY, encodeCache({ options: {}, contentVersion: 2 }));
      return { data: { flashcards } };
    });

    await fetchFlashcardsByChapter(1, "human");

    const stored = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(stored.contentVersion).toBe(2);
    expect(stored.questions_mixed_1).toBeUndefined();
    expect(stored.flashcards_human_1.flashcards).toEqual(flashcards);
  });
});
