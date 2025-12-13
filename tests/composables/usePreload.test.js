import { describe, it, expect, beforeEach, vi } from "vitest";
import { CACHE_KEY, STALE_TIME } from "../../src/config/constants";
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

import { preloadContent } from "../../src/composables/usePreload";
import { decodeCache, encodeCache } from "../../src/composables/useQuestion";

describe("usePreload", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("skips preload when cache is still fresh", async () => {
    const freshCache = encodeCache({
      1: { timestamp: Date.now(), questions: [{ id: "q1" }] },
    });
    localStorage.setItem(CACHE_KEY, freshCache);

    await preloadContent();

    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("preloads and stores questions/flashcards when cache is stale", async () => {
    const staleCache = encodeCache({
      1: { timestamp: Date.now() - STALE_TIME - 1000, questions: [{ id: "old" }] },
    });
    localStorage.setItem(CACHE_KEY, staleCache);

    mockCallable.mockResolvedValue({
      data: {
        questions: { 1: [{ id: "q1" }] },
        flashcards: { 2: [{ id: "f1" }] },
      },
    });

    await preloadContent();

    expect(httpsCallable).toHaveBeenCalledTimes(1);
    const stored = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(stored[1].questions).toEqual([{ id: "q1" }]);
    expect(stored["flashcards_2"].flashcards).toEqual([{ id: "f1" }]);
  });
});
