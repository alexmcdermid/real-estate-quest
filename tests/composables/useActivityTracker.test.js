import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockLogStudyActivity = vi.fn().mockResolvedValue({});

vi.mock("firebase/functions", () => {
  return {
    getFunctions: vi.fn(() => ({})),
    httpsCallable: vi.fn(() => mockLogStudyActivity),
  };
});

vi.mock("../../src/config/firebaseConfig", () => ({
  firebaseApp: {},
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useActivityTracker lifecycle flushing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", {value: "visible", configurable: true});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flushes buffered events when the tab becomes hidden", async () => {
    const {useActivityTracker} = await import("../../src/composables/useActivityTracker");
    const tracker = useActivityTracker();

    tracker.recordQuestionAnswer({
      question: {chapter: 1, questionNumber: 2, premium: false},
      isCorrect: true,
      selectedChoice: 0,
      isProUser: false,
    });

    expect(mockLogStudyActivity).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {value: "hidden", configurable: true});
    document.dispatchEvent(new Event("visibilitychange"));

    await flushPromises();

    expect(mockLogStudyActivity).toHaveBeenCalledTimes(1);
    const payload = mockLogStudyActivity.mock.calls[0][0];
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].type).toBe("question");
  });

  it("flushes buffered events on pagehide", async () => {
    const {useActivityTracker} = await import("../../src/composables/useActivityTracker");
    const tracker = useActivityTracker();

    tracker.recordFlashcardView({
      flashcard: {chapter: 3, cardNumber: 5, premium: false},
      isProUser: false,
    });

    expect(mockLogStudyActivity).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pagehide"));
    await flushPromises();

    expect(mockLogStudyActivity).toHaveBeenCalledTimes(1);
    const payload = mockLogStudyActivity.mock.calls[0][0];
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].type).toBe("flashcard");
  });

  it("attaches lifecycle handlers only once", async () => {
    const windowSpy = vi.spyOn(window, "addEventListener");
    const documentSpy = vi.spyOn(document, "addEventListener");
    const {useActivityTracker} = await import("../../src/composables/useActivityTracker");

    useActivityTracker();
    useActivityTracker();

    const windowCalls = windowSpy.mock.calls.filter((c) => c[0] === "pagehide");
    const visibilityCalls = documentSpy.mock.calls.filter((c) => c[0] === "visibilitychange");

    expect(windowCalls).toHaveLength(1);
    expect(visibilityCalls).toHaveLength(1);
  });

  it("flushes small batches after the interval even if under threshold", async () => {
    vi.useFakeTimers();
    const {useActivityTracker} = await import("../../src/composables/useActivityTracker");
    const tracker = useActivityTracker();

    tracker.recordFlashcardView({
      flashcard: {chapter: 1, cardNumber: 1, premium: false},
      isProUser: false,
    });

    expect(mockLogStudyActivity).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20000);
    await vi.runAllTimersAsync();

    expect(mockLogStudyActivity).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("sends only finite selectedChoice values", async () => {
    const {useActivityTracker} = await import("../../src/composables/useActivityTracker");
    const tracker = useActivityTracker();

    tracker.recordQuestionAnswer({
      question: {chapter: 2, questionNumber: 3, premium: false},
      selectedChoice: Number.NaN,
      isCorrect: true,
      isProUser: false,
    });

    await tracker.flushPendingEvents(true);

    const payload = mockLogStudyActivity.mock.calls[0][0];
    expect(payload.events[0].selectedChoice).toBeNull();
  });
});
