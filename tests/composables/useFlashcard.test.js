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
import { decodeCache } from "../../src/composables/useQuestion";

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
});
