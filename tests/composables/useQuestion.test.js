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

import { encodeCache, decodeCache, clearCache, fetchQuestionsByChapter } from "../../src/composables/useQuestion";

describe("useQuestion helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("encodes and decodes cache objects safely", () => {
    const payload = { foo: "bar", nested: { val: 1 } };
    const encoded = encodeCache(payload);
    const decoded = decodeCache(encoded);
    expect(decoded).toEqual(payload);
  });

  it("clearCache preserves options while dropping other entries", () => {
    const original = encodeCache({
      options: { isDark: true },
      1: { timestamp: 1, questions: [1, 2, 3] },
    });
    localStorage.setItem(CACHE_KEY, original);

    clearCache();

    const stored = localStorage.getItem(CACHE_KEY);
    const decoded = decodeCache(stored);
    expect(decoded.options).toEqual({ isDark: true });
    expect(decoded[1]).toBeUndefined();
  });

  it("fetchQuestionsByChapter caches responses and reuses fresh cache", async () => {
    const questions = [{ id: "q1" }];
    mockCallable.mockResolvedValue({ data: { questions } });

    const first = await fetchQuestionsByChapter(2);
    expect(first).toEqual(questions);
    expect(httpsCallable).toHaveBeenCalledTimes(1);
    expect(mockCallable).toHaveBeenCalledTimes(1);

    const second = await fetchQuestionsByChapter(2);
    expect(second).toEqual(questions);
    expect(mockCallable).toHaveBeenCalledTimes(1); // Served from cache
  });
});
