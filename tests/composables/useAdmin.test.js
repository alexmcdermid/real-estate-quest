import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { httpsCallable } from "firebase/functions";
import { useAdminStore } from "../../src/composables/useAdmin";
import { showNotification } from "../../src/composables/useNotifier";

const callableMap = {};

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn((_, name) => {
    const fn = callableMap[name];
    if (!fn) throw new Error(`Unknown callable: ${name}`);
    return fn;
  }),
}));

vi.mock("../../src/config/firebaseConfig", () => ({
  firebaseApp: {},
}));

vi.mock("../../src/composables/useNotifier", () => ({
  showNotification: vi.fn(),
}));

describe("useAdmin pagination actions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.keys(callableMap).forEach((key) => delete callableMap[key]);
  });

  it("loads initial data and paginates activity/rate/error logs, members, and users", async () => {
    callableMap.getAdminData = vi.fn().mockResolvedValue({
      data: {
        members: [{ id: "m1" }],
        membersPageInfo: { hasMore: true, cursor: { id: "m1" } },
        users: [{ uid: "u1" }],
        usersPageInfo: { hasMore: true, cursor: "token1" },
        rateLimitLogs: [{ id: "r1" }],
        rateLimitLogsPageInfo: { hasMore: true, cursor: { timestampMs: 1, id: "r1" } },
        errorLogs: [{ id: "e1" }],
        errorLogsPageInfo: { hasMore: true, cursor: { lastSeenMs: 1, id: "e1" } },
        activityLogs: [{ id: "a1" }],
        activityLogsPageInfo: { hasMore: true, cursor: { createdAtMs: 1, id: "a1" } },
        stats: {},
        timestamp: "now",
      },
    });

    callableMap.getStudyActivityLogsPage = vi.fn().mockImplementation((data) => {
      if (data.page === 1) {
        return Promise.resolve({
          data: {
            activityLogs: [{ id: "a1" }],
            pageInfo: { hasMore: true, page: 1, pageSize: 20, total: 2 },
          },
        });
      } else {
        return Promise.resolve({
          data: {
            activityLogs: [{ id: "a2" }],
            pageInfo: { hasMore: false, page: 2, pageSize: 20, total: 2 },
          },
        });
      }
    });

    callableMap.getRateLimitLogsPage = vi.fn().mockImplementation((data) => {
      if (data.page === 1) {
        return Promise.resolve({
          data: {
            rateLimitLogs: [{ id: "r1" }],
            pageInfo: { hasMore: true, page: 1, pageSize: 20, total: 2 },
          },
        });
      } else {
        return Promise.resolve({
          data: {
            rateLimitLogs: [{ id: "r2" }],
            pageInfo: { hasMore: false, page: 2, pageSize: 20, total: 2 },
          },
        });
      }
    });

    callableMap.getFunctionErrorLogsPage = vi.fn().mockImplementation((data) => {
      if (data.page === 1) {
        return Promise.resolve({
          data: {
            errorLogs: [{ id: "e1" }],
            pageInfo: { hasMore: true, page: 1, pageSize: 20, total: 2 },
          },
        });
      } else {
        return Promise.resolve({
          data: {
            errorLogs: [{ id: "e2" }],
            pageInfo: { hasMore: false, page: 2, pageSize: 20, total: 2 },
          },
        });
      }
    });

    callableMap.getMembersPage = vi.fn().mockImplementation((data) => {
      if (data.page === 1) {
        return Promise.resolve({
          data: {
            members: [{ id: "m1" }],
            pageInfo: { hasMore: true, page: 1, pageSize: 20, total: 2 },
          },
        });
      } else {
        return Promise.resolve({
          data: {
            members: [{ id: "m2" }],
            pageInfo: { hasMore: false, page: 2, pageSize: 20, total: 2 },
          },
        });
      }
    });

    callableMap.getUsersPage = vi.fn().mockImplementation((data) => {
      if (data.page === 1) {
        return Promise.resolve({
          data: {
            users: [{ uid: "u1" }],
            pageInfo: { hasMore: true, page: 1, pageSize: 20, total: 2 },
          },
        });
      } else {
        return Promise.resolve({
          data: {
            users: [{ uid: "u2" }],
            pageInfo: { hasMore: false, page: 2, pageSize: 20, total: 2 },
          },
        });
      }
    });

    const store = useAdminStore();
    await store.fetchAdminData();

    // Initial page fetches
    await store.fetchActivityLogsPage(1, 20);
    await store.fetchRateLimitLogsPage(1, 20);
    await store.fetchErrorLogsPage(1, 20);
    await store.fetchMembersPage(1, 20);
    await store.fetchUsersPage(1, 20);

    expect(store.activityLogs).toHaveLength(1);
    expect(store.activityLogsTotal).toBe(2);
    expect(store.rateLimitLogs).toHaveLength(1);
    expect(store.rateLimitLogsTotal).toBe(2);
    expect(store.errorLogs).toHaveLength(1);
    expect(store.errorLogsTotal).toBe(2);
    expect(store.members).toHaveLength(1);
    expect(store.membersTotal).toBe(2);
    expect(store.users).toHaveLength(1);
    expect(store.usersTotal).toBe(2);

    // Fetch more (next page)
    await store.fetchActivityLogsPage(2, 20);
    await store.fetchRateLimitLogsPage(2, 20);
    await store.fetchErrorLogsPage(2, 20);
    await store.fetchMembersPage(2, 20);
    await store.fetchUsersPage(2, 20);

    expect(store.activityLogs.map((l) => l.id)).toEqual(["a2"]);
    expect(store.rateLimitLogs.map((l) => l.id)).toEqual(["r2"]);
    expect(store.errorLogs.map((l) => l.id)).toEqual(["e2"]);
    expect(store.members.map((m) => m.id)).toEqual(["m2"]);
    expect(store.users.map((u) => u.uid)).toEqual(["u2"]);
  });
});

describe("useAdmin AI content actions", () => {
  const pendingQuestion = (id, chapter = 3) => ({
    id,
    chapter,
    question: `Question ${id}?`,
    choices: ["A", "B", "C", "D"],
    correctChoice: 1,
    explanation: "Correct Answer: 2 because B.",
    generatedAt: "2026-10-26T16:00:00.000Z",
    generationRunId: "run1",
    trigger: "scheduled",
    requestedBy: null,
  });

  const pendingFlashcard = (id, chapter = 7) => ({
    id,
    chapter,
    front: `Term ${id}`,
    back: `Definition of term ${id}.`,
    tags: ["definitions", "land law"],
    difficulty: 2,
    generatedAt: "2026-10-26T16:05:00.000Z",
    generationRunId: "run2",
    trigger: "manual",
    requestedBy: "admin1",
  });

  const aiReviewQueueResponse = () => ({
    data: {
      pendingQuestions: [pendingQuestion("p1"), pendingQuestion("p2")],
      pendingFlashcards: [pendingFlashcard("c1"), pendingFlashcard("c2")],
      generationRuns: [
        { id: "run2", contentType: "flashcards", requestedItemCount: 2, generatedItemCount: 2, status: "succeeded" },
        { id: "run1", contentType: "questions", requestedItemCount: 2, generatedItemCount: 2, status: "succeeded" },
      ],
      settings: { generationEnabled: true, servingEnabled: false, questionsPerRun: 2, flashcardsPerRun: 3 },
      questionChapterSplits: { 3: { humanTotal: 20, humanFree: 5, aiTotal: 1, aiFree: 0 } },
      flashcardChapterSplits: { 7: { humanTotal: 15, humanFree: 4, aiTotal: 0, aiFree: 0 } },
    },
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    Object.keys(callableMap).forEach((key) => delete callableMap[key]);
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  async function storeWithReviewQueue() {
    callableMap.getAiReviewQueue = vi.fn().mockResolvedValue(aiReviewQueueResponse());
    const store = useAdminStore();
    await store.fetchAiReviewQueue();
    return store;
  }

  it("fetchAiReviewQueue fills the AI state for questions and flashcards", async () => {
    const store = await storeWithReviewQueue();

    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p1", "p2"]);
    expect(store.aiPendingFlashcards.map((f) => f.id)).toEqual(["c1", "c2"]);
    expect(store.aiGenerationRuns.map((run) => run.contentType)).toEqual(["flashcards", "questions"]);
    expect(store.aiSettings).toEqual({ generationEnabled: true, servingEnabled: false, questionsPerRun: 2, flashcardsPerRun: 3 });
    expect(store.aiQuestionChapterSplits[3]).toEqual({ humanTotal: 20, humanFree: 5, aiTotal: 1, aiFree: 0 });
    expect(store.aiFlashcardChapterSplits[7]).toEqual({ humanTotal: 15, humanFree: 4, aiTotal: 0, aiFree: 0 });
    expect(store.aiHasLoaded).toBe(true);
    expect(store.aiLoading).toBe(false);
  });

  it("fetchAiReviewQueue reports a failure without throwing", async () => {
    callableMap.getAiReviewQueue = vi.fn().mockRejectedValue(new Error("Failed to load the AI review queue"));
    const store = useAdminStore();

    await expect(store.fetchAiReviewQueue()).resolves.toBeUndefined();

    expect(store.aiHasLoaded).toBe(false);
    expect(store.aiLoading).toBe(false);
    expect(showNotification).toHaveBeenCalledWith("Error loading AI content: Failed to load the AI review queue", "error");
  });

  it("approveAiQuestion sends the edits, removes the question and updates the question chapter split", async () => {
    const store = await storeWithReviewQueue();
    callableMap.approveAiQuestion = vi.fn().mockResolvedValue({
      data: { success: true, chapter: 3, questionNumber: 2, alreadyInRepo: false },
    });
    const editedQuestion = { question: "Edited?", choices: ["A", "B", "C", "D"], correctChoice: 1, explanation: "Correct Answer: 2" };

    const result = await store.approveAiQuestion({ pendingQuestionId: "p1", editedQuestion, premium: false });

    expect(callableMap.approveAiQuestion).toHaveBeenCalledWith({ pendingQuestionId: "p1", editedQuestion, premium: false });
    expect(result).toEqual({ success: true, chapter: 3, questionNumber: 2, alreadyInRepo: false });
    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p2"]);
    expect(store.aiPendingFlashcards.map((f) => f.id)).toEqual(["c1", "c2"]);
    expect(store.aiQuestionChapterSplits[3]).toEqual({ humanTotal: 20, humanFree: 5, aiTotal: 2, aiFree: 1 });
    expect(showNotification).toHaveBeenCalledWith("Approved as AI question 2 in chapter 3", "success");
  });

  it("approveAiQuestion keeps the question and rethrows on failure", async () => {
    const store = await storeWithReviewQueue();
    callableMap.approveAiQuestion = vi.fn().mockRejectedValue(new Error("Chapter 3 is being updated right now."));

    await expect(store.approveAiQuestion({ pendingQuestionId: "p1", editedQuestion: {}, premium: true }))
      .rejects.toThrow("Chapter 3 is being updated right now.");

    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p1", "p2"]);
    expect(store.aiQuestionChapterSplits[3].aiTotal).toBe(1);
    expect(showNotification).toHaveBeenLastCalledWith("Error approving AI question: Chapter 3 is being updated right now.", "error");
  });

  it("rejectAiQuestion sends the reason and removes the question", async () => {
    const store = await storeWithReviewQueue();
    callableMap.rejectAiQuestion = vi.fn().mockResolvedValue({ data: { success: true } });

    await store.rejectAiQuestion({ pendingQuestionId: "p2", rejectionReason: "Too easy" });

    expect(callableMap.rejectAiQuestion).toHaveBeenCalledWith({ pendingQuestionId: "p2", rejectionReason: "Too easy" });
    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p1"]);
    expect(showNotification).toHaveBeenLastCalledWith("AI question rejected", "success");
  });

  it("approveAiFlashcard sends the edits, removes the flashcard and updates the flashcard chapter split", async () => {
    const store = await storeWithReviewQueue();
    callableMap.approveAiFlashcard = vi.fn().mockResolvedValue({
      data: { success: true, chapter: 7, cardNumber: 1, alreadyInRepo: false },
    });
    const editedFlashcard = { front: "Easement", back: "A right to use another's land.", tags: ["definitions"], difficulty: 1 };

    const result = await store.approveAiFlashcard({ pendingFlashcardId: "c1", editedFlashcard, premium: false });

    expect(callableMap.approveAiFlashcard).toHaveBeenCalledWith({ pendingFlashcardId: "c1", editedFlashcard, premium: false });
    expect(result).toEqual({ success: true, chapter: 7, cardNumber: 1, alreadyInRepo: false });
    expect(store.aiPendingFlashcards.map((f) => f.id)).toEqual(["c2"]);
    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p1", "p2"]);
    expect(store.aiFlashcardChapterSplits[7]).toEqual({ humanTotal: 15, humanFree: 4, aiTotal: 1, aiFree: 1 });
    expect(store.aiQuestionChapterSplits[3]).toEqual({ humanTotal: 20, humanFree: 5, aiTotal: 1, aiFree: 0 });
    expect(showNotification).toHaveBeenCalledWith("Approved as AI flashcard 1 in chapter 7", "success");
  });

  it("approveAiFlashcard counts a premium card as not free and leaves the split alone when it was already in the repo", async () => {
    const store = await storeWithReviewQueue();
    callableMap.approveAiFlashcard = vi.fn()
      .mockResolvedValueOnce({ data: { success: true, chapter: 7, cardNumber: 1, alreadyInRepo: false } })
      .mockResolvedValueOnce({ data: { success: true, chapter: 7, cardNumber: 1, alreadyInRepo: true } });

    await store.approveAiFlashcard({ pendingFlashcardId: "c1", editedFlashcard: {}, premium: true });
    expect(store.aiFlashcardChapterSplits[7]).toEqual({ humanTotal: 15, humanFree: 4, aiTotal: 1, aiFree: 0 });

    // An earlier attempt already landed in the repo, so the card is not counted twice
    await store.approveAiFlashcard({ pendingFlashcardId: "c2", editedFlashcard: {}, premium: false });
    expect(store.aiFlashcardChapterSplits[7]).toEqual({ humanTotal: 15, humanFree: 4, aiTotal: 1, aiFree: 0 });
    expect(store.aiPendingFlashcards).toEqual([]);
  });

  it("approveAiFlashcard keeps the flashcard and rethrows on failure", async () => {
    const store = await storeWithReviewQueue();
    callableMap.approveAiFlashcard = vi.fn().mockRejectedValue(new Error("front must be at most 100 characters"));

    await expect(store.approveAiFlashcard({ pendingFlashcardId: "c1", editedFlashcard: {}, premium: true }))
      .rejects.toThrow("front must be at most 100 characters");

    expect(store.aiPendingFlashcards.map((f) => f.id)).toEqual(["c1", "c2"]);
    expect(store.aiFlashcardChapterSplits[7].aiTotal).toBe(0);
    expect(showNotification).toHaveBeenLastCalledWith("Error approving AI flashcard: front must be at most 100 characters", "error");
  });

  it("rejectAiFlashcard sends the reason and removes the flashcard", async () => {
    const store = await storeWithReviewQueue();
    callableMap.rejectAiFlashcard = vi.fn().mockResolvedValue({ data: { success: true } });

    await store.rejectAiFlashcard({ pendingFlashcardId: "c2", rejectionReason: "Covered by a human card" });

    expect(callableMap.rejectAiFlashcard).toHaveBeenCalledWith({ pendingFlashcardId: "c2", rejectionReason: "Covered by a human card" });
    expect(store.aiPendingFlashcards.map((f) => f.id)).toEqual(["c1"]);
    expect(showNotification).toHaveBeenLastCalledWith("AI flashcard rejected", "success");
  });

  it("rejectAiFlashcard keeps the flashcard and rethrows on failure", async () => {
    const store = await storeWithReviewQueue();
    callableMap.rejectAiFlashcard = vi.fn().mockRejectedValue(new Error("Only pending flashcards can be rejected"));

    await expect(store.rejectAiFlashcard({ pendingFlashcardId: "c1", rejectionReason: "" }))
      .rejects.toThrow("Only pending flashcards can be rejected");

    expect(store.aiPendingFlashcards.map((f) => f.id)).toEqual(["c1", "c2"]);
    expect(showNotification).toHaveBeenLastCalledWith("Error rejecting AI flashcard: Only pending flashcards can be rejected", "error");
  });

  it("updateAiSettings sends flashcardsPerRun and stores the settings the server saved", async () => {
    const store = await storeWithReviewQueue();
    const savedSettings = { generationEnabled: true, servingEnabled: true, questionsPerRun: 5, flashcardsPerRun: 4 };
    callableMap.updateAiSettings = vi.fn().mockResolvedValue({ data: { settings: savedSettings } });

    await store.updateAiSettings({ servingEnabled: true, questionsPerRun: 5, flashcardsPerRun: 4 });

    expect(callableMap.updateAiSettings).toHaveBeenCalledWith({ servingEnabled: true, questionsPerRun: 5, flashcardsPerRun: 4 });
    expect(store.aiSettings).toEqual(savedSettings);
  });

  it("updateAiSettings rethrows on failure", async () => {
    const store = await storeWithReviewQueue();
    callableMap.updateAiSettings = vi.fn().mockRejectedValue(new Error("invalid"));

    await expect(store.updateAiSettings({ flashcardsPerRun: 11 })).rejects.toThrow("invalid");
    expect(store.aiSettings.flashcardsPerRun).toBe(3);
  });

  it("generateAiContentNow uses a 1800000 ms timeout and refreshes the queue after a live run", async () => {
    const store = await storeWithReviewQueue();
    const runResult = {
      runId: "run3",
      contentType: "flashcards",
      chapter: 5,
      dryRun: false,
      requestedItemCount: 2,
      generatedItemCount: 2,
      status: "succeeded",
      errors: [],
      items: [],
    };
    callableMap.generateAiContentNow = vi.fn().mockResolvedValue({ data: runResult });
    callableMap.getAiReviewQueue.mockClear();

    const result = await store.generateAiContentNow({ contentType: "flashcards", chapter: 5, itemCount: 2, dryRun: false });

    expect(httpsCallable).toHaveBeenCalledWith({}, "generateAiContentNow", { timeout: 1800000 });
    expect(callableMap.generateAiContentNow).toHaveBeenCalledWith({ contentType: "flashcards", chapter: 5, itemCount: 2, dryRun: false });
    expect(result).toEqual(runResult);
    expect(callableMap.getAiReviewQueue).toHaveBeenCalledTimes(1);
  });

  it("generateAiContentNow does not refresh the queue after a dry run", async () => {
    const store = await storeWithReviewQueue();
    callableMap.generateAiContentNow = vi.fn().mockResolvedValue({
      data: { runId: "run4", contentType: "questions", chapter: 5, dryRun: true, status: "succeeded", errors: [], items: [] },
    });
    callableMap.getAiReviewQueue.mockClear();

    await store.generateAiContentNow({ contentType: "questions", chapter: null, itemCount: null, dryRun: true });

    expect(callableMap.generateAiContentNow).toHaveBeenCalledWith({ contentType: "questions", chapter: null, itemCount: null, dryRun: true });
    expect(callableMap.getAiReviewQueue).not.toHaveBeenCalled();
  });

  it("generateAiContentNow rethrows on failure", async () => {
    const store = await storeWithReviewQueue();
    callableMap.generateAiContentNow = vi.fn().mockRejectedValue(new Error("A generation run is already in progress"));

    await expect(store.generateAiContentNow({ contentType: "questions", chapter: null, itemCount: null, dryRun: false }))
      .rejects.toThrow("A generation run is already in progress");
    expect(showNotification).toHaveBeenLastCalledWith(
      "Error generating AI content: A generation run is already in progress",
      "error",
    );
  });

  it("clearData resets the AI state", async () => {
    const store = await storeWithReviewQueue();

    store.clearData();

    expect(store.aiPendingQuestions).toEqual([]);
    expect(store.aiPendingFlashcards).toEqual([]);
    expect(store.aiGenerationRuns).toEqual([]);
    expect(store.aiSettings).toEqual({ generationEnabled: false, servingEnabled: false, questionsPerRun: 1, flashcardsPerRun: 1 });
    expect(store.aiQuestionChapterSplits).toEqual({});
    expect(store.aiFlashcardChapterSplits).toEqual({});
    expect(store.aiHasLoaded).toBe(false);
  });
});
