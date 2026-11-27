import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CACHE_KEY } from "../../src/config/constants";

const mockGetContentStatus = vi.fn();

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => mockGetContentStatus),
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

// Fresh modules per test: contentStatus and the memoized check live at module scope
async function importFreshModules() {
  vi.resetModules();
  const useContentStatus = await import("../../src/composables/useContentStatus");
  const { encodeCache, decodeCache } = await import("../../src/composables/useQuestion");
  return { ...useContentStatus, encodeCache, decodeCache };
}

describe("useContentStatus", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears cached content but keeps options and stores the new version when the version changed", async () => {
    const { checkContentStatus, contentStatus, encodeCache, decodeCache } = await importFreshModules();
    localStorage.setItem(CACHE_KEY, encodeCache({
      options: { shuffled: true, contentSource: "ai" },
      contentVersion: 3,
      questions_mixed_1: { timestamp: Date.now(), questions: [{ id: "q1" }] },
      flashcards_mixed_1: { timestamp: Date.now(), flashcards: [{ id: "f1" }] },
    }));
    mockGetContentStatus.mockResolvedValue({ data: { contentVersion: 4, aiContentServed: true } });

    await checkContentStatus();

    expect(decodeCache(localStorage.getItem(CACHE_KEY))).toEqual({
      options: { shuffled: true, contentSource: "ai" },
      contentVersion: 4,
    });
    expect(contentStatus).toEqual({ contentVersion: 4, aiContentServed: true, checked: true });
  });

  it("stores the version on a first visit with no cache", async () => {
    const { checkContentStatus, decodeCache } = await importFreshModules();
    mockGetContentStatus.mockResolvedValue({ data: { contentVersion: 0, aiContentServed: false } });

    await checkContentStatus();

    expect(decodeCache(localStorage.getItem(CACHE_KEY)).contentVersion).toBe(0);
  });

  it("gives the callable a 10 second timeout so a stalled check falls back to the cache quickly", async () => {
    const { checkContentStatus } = await importFreshModules();
    const { httpsCallable } = await import("firebase/functions");
    mockGetContentStatus.mockResolvedValue({ data: { contentVersion: 1, aiContentServed: false } });

    await checkContentStatus();

    expect(httpsCallable).toHaveBeenCalledWith({}, "getContentStatus", { timeout: 10000 });
  });

  it("keeps the cache when the version is unchanged", async () => {
    const { checkContentStatus, contentStatus, encodeCache, decodeCache } = await importFreshModules();
    const cached = {
      options: { shuffled: false },
      contentVersion: 7,
      questions_human_2: { timestamp: Date.now(), questions: [{ id: "q2" }] },
    };
    localStorage.setItem(CACHE_KEY, encodeCache(cached));
    mockGetContentStatus.mockResolvedValue({ data: { contentVersion: 7, aiContentServed: false } });

    await checkContentStatus();

    expect(decodeCache(localStorage.getItem(CACHE_KEY))).toEqual(cached);
    expect(contentStatus.checked).toBe(true);
  });

  it("keeps the cache and leaves AI content hidden when the callable fails", async () => {
    const { checkContentStatus, contentStatus, encodeCache, decodeCache } = await importFreshModules();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cached = {
      contentVersion: 2,
      questions_mixed_1: { timestamp: Date.now(), questions: [{ id: "q1" }] },
    };
    localStorage.setItem(CACHE_KEY, encodeCache(cached));
    mockGetContentStatus.mockRejectedValue(new Error("network down"));

    await expect(checkContentStatus()).resolves.toBeUndefined();

    expect(decodeCache(localStorage.getItem(CACHE_KEY))).toEqual(cached);
    expect(contentStatus).toEqual({ contentVersion: null, aiContentServed: false, checked: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a response without a numeric contentVersion as a failure", async () => {
    const { checkContentStatus, contentStatus, encodeCache, decodeCache } = await importFreshModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cached = { contentVersion: 2, questions_mixed_1: { timestamp: Date.now(), questions: [] } };
    localStorage.setItem(CACHE_KEY, encodeCache(cached));
    mockGetContentStatus.mockResolvedValue({ data: { aiContentServed: true } });

    await checkContentStatus();

    expect(decodeCache(localStorage.getItem(CACHE_KEY))).toEqual(cached);
    expect(contentStatus.aiContentServed).toBe(false);
    expect(contentStatus.checked).toBe(true);
  });

  it("ensureContentStatusChecked calls the callable once per page load", async () => {
    const { ensureContentStatusChecked } = await importFreshModules();
    mockGetContentStatus.mockResolvedValue({ data: { contentVersion: 1, aiContentServed: true } });

    await Promise.all([ensureContentStatusChecked(), ensureContentStatusChecked()]);
    await ensureContentStatusChecked();

    expect(mockGetContentStatus).toHaveBeenCalledTimes(1);
  });

  it("resolveContentSource follows the serving switch, then Pro, then the saved choice", async () => {
    const { resolveContentSource, CONTENT_SOURCES } = await importFreshModules();
    const resolve = (aiContentServed, isPro, requestedContentSource) =>
      resolveContentSource({ aiContentServed, isPro, requestedContentSource });

    expect(CONTENT_SOURCES).toEqual(["mixed", "human", "ai"]);
    // Serving off: human content only, whatever the user picked
    expect(resolve(false, true, "ai")).toBe("human");
    expect(resolve(false, false, "mixed")).toBe("human");
    // Free users get no choice
    expect(resolve(true, false, "ai")).toBe("mixed");
    expect(resolve(true, false, "human")).toBe("mixed");
    // Pro users get their valid choice, else mixed
    expect(resolve(true, true, "ai")).toBe("ai");
    expect(resolve(true, true, "human")).toBe("human");
    expect(resolve(true, true, "mixed")).toBe("mixed");
    expect(resolve(true, true, undefined)).toBe("mixed");
    expect(resolve(true, true, "robots")).toBe("mixed");
  });
});
