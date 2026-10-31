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

import { fetchFlashcardsByChapter } from "../../src/composables/useFlashcard";
import { decodeCache, encodeCache } from "../../src/composables/useQuestion";

describe("useFlashcard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("fetchFlashcardsByChapter caches and reuses flashcards", async () => {
    const flashcards = [{ id: "f1" }];
    mockCallable.mockResolvedValue({ data: { flashcards } });

    const first = await fetchFlashcardsByChapter(1);
    expect(first).toEqual(flashcards);
    expect(httpsCallable).toHaveBeenCalledTimes(1);
    expect(mockCallable).toHaveBeenCalledTimes(1);

    const second = await fetchFlashcardsByChapter(1);
    expect(second).toEqual(flashcards);
    expect(mockCallable).toHaveBeenCalledTimes(1); // From cache

    const stored = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(stored["flashcards_1"].flashcards).toEqual(flashcards);
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

    await fetchFlashcardsByChapter(1);

    const stored = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(stored.contentVersion).toBe(2);
    expect(stored.questions_mixed_1).toBeUndefined();
    expect(stored.flashcards_1.flashcards).toEqual(flashcards);
  });
});
