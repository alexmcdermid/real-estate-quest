import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifier, showNotification } from "../../src/composables/useNotifier";
import { rateLimitBanner, showRateLimitBanner, hideRateLimitBanner } from "../../src/composables/useRateLimitBanner";

describe("useNotifier", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    notifier.show = false;
    notifier.message = "";
    notifier.color = "error";
    notifier.timeout = 5000;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a notification with provided values", () => {
    showNotification("Hello", "success", 1000);

    expect(notifier.show).toBe(true);
    expect(notifier.message).toBe("Hello");
    expect(notifier.color).toBe("success");
    expect(notifier.timeout).toBe(1000);
  });

  it("hides the notification after the timeout elapses", () => {
    showNotification("Hello", "success", 1000);
    expect(notifier.show).toBe(true);

    vi.advanceTimersByTime(1000);

    expect(notifier.show).toBe(false);
  });
});

describe("useRateLimitBanner", () => {
  it("toggles banner visibility", () => {
    rateLimitBanner.value = false;
    showRateLimitBanner();
    expect(rateLimitBanner.value).toBe(true);
    hideRateLimitBanner();
    expect(rateLimitBanner.value).toBe(false);
  });
});
