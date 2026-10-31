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

import {
  encodeCache,
  decodeCache,
  clearCache,
  fetchQuestionsByChapter,
  questionsCacheKey,
} from "../../src/composables/useQuestion";

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

  it("clearCache preserves options and the content version while dropping other entries", () => {
    const original = encodeCache({
      options: { isDark: true },
      contentVersion: 5,
      1: { timestamp: 1, questions: [1, 2, 3] },
      questions_mixed_1: { timestamp: 1, questions: [1, 2, 3] },
    });
    localStorage.setItem(CACHE_KEY, original);

    clearCache();

    const stored = localStorage.getItem(CACHE_KEY);
    const decoded = decodeCache(stored);
    expect(decoded).toEqual({ options: { isDark: true }, contentVersion: 5 });
  });

  it("questionsCacheKey includes the source and the chapter", () => {
    expect(questionsCacheKey("ai", 3)).toBe("questions_ai_3");
    expect(questionsCacheKey("mixed", "12")).toBe("questions_mixed_12");
  });

  it("fetchQuestionsByChapter caches responses and reuses fresh cache", async () => {
    const questions = [{ id: "q1" }];
    mockCallable.mockResolvedValue({ data: { questions } });

    const first = await fetchQuestionsByChapter(2);
    expect(first).toEqual(questions);
    expect(httpsCallable).toHaveBeenCalledTimes(1);
    expect(mockCallable).toHaveBeenCalledTimes(1);
    expect(mockCallable).toHaveBeenCalledWith({ chapter: 2, questionSource: "mixed" });

    const second = await fetchQuestionsByChapter(2);
    expect(second).toEqual(questions);
    expect(mockCallable).toHaveBeenCalledTimes(1); // Served from cache
  });

  it("fetchQuestionsByChapter sends the source and caches each source separately", async () => {
    const aiQuestions = [{ id: "ai1", aiGenerated: true }];
    const humanQuestions = [{ id: "h1" }];
    mockCallable
      .mockResolvedValueOnce({ data: { questions: aiQuestions, questionSource: "ai" } })
      .mockResolvedValueOnce({ data: { questions: humanQuestions, questionSource: "human" } });

    expect(await fetchQuestionsByChapter(4, "ai")).toEqual(aiQuestions);
    expect(mockCallable).toHaveBeenLastCalledWith({ chapter: 4, questionSource: "ai" });

    // A different source for the same chapter is not served from the AI entry
    expect(await fetchQuestionsByChapter(4, "human")).toEqual(humanQuestions);
    expect(mockCallable).toHaveBeenLastCalledWith({ chapter: 4, questionSource: "human" });
    expect(mockCallable).toHaveBeenCalledTimes(2);

    const stored = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(stored.questions_ai_4.questions).toEqual(aiQuestions);
    expect(stored.questions_human_4.questions).toEqual(humanQuestions);

    // Both are now served from the cache
    expect(await fetchQuestionsByChapter(4, "ai")).toEqual(aiQuestions);
    expect(await fetchQuestionsByChapter(4, "human")).toEqual(humanQuestions);
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });
});
