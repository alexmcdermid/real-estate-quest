import { describe, it, expect, beforeEach, vi } from "vitest";
import { CACHE_KEY } from "../../src/config/constants";

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
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

import { getOptions, setOptions } from "../../src/composables/useOption";
import { decodeCache, encodeCache } from "../../src/composables/useQuestion";

describe("useOption", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when no cache is present", () => {
    const options = getOptions();
    expect(options).toEqual({ shuffled: false, isDark: false, contentSource: "mixed" });
  });

  it("persists options to cache when setOptions is called", () => {
    setOptions({ shuffled: true });
    const cached = decodeCache(localStorage.getItem(CACHE_KEY));
    expect(cached.options).toEqual({ shuffled: true, isDark: false, contentSource: "mixed" });
  });

  it("merges the new defaults into options saved before they existed", () => {
    localStorage.setItem(CACHE_KEY, encodeCache({ options: { shuffled: true, isDark: true } }));
    expect(getOptions()).toEqual({ shuffled: true, isDark: true, contentSource: "mixed" });
  });

  it("keeps a saved content source", () => {
    localStorage.setItem(CACHE_KEY, encodeCache({ options: { shuffled: false, isDark: false, contentSource: "ai" } }));
    expect(getOptions().contentSource).toBe("ai");
  });
});
