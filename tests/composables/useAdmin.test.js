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

describe("useAdmin AI question actions", () => {
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

  const aiPendingQuestionsResponse = () => ({
    data: {
      pendingQuestions: [pendingQuestion("p1"), pendingQuestion("p2")],
      generationRuns: [{ id: "run1", status: "succeeded" }],
      settings: { generationEnabled: true, servingEnabled: false, questionsPerRun: 2 },
      chapterSplits: { 3: { humanTotal: 20, humanFree: 5, aiTotal: 1, aiFree: 0 } },
    },
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    Object.keys(callableMap).forEach((key) => delete callableMap[key]);
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  async function storeWithPendingQuestions() {
    callableMap.getAiPendingQuestions = vi.fn().mockResolvedValue(aiPendingQuestionsResponse());
    const store = useAdminStore();
    await store.fetchAiPendingQuestions();
    return store;
  }

  it("fetchAiPendingQuestions fills the AI state", async () => {
    const store = await storeWithPendingQuestions();

    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p1", "p2"]);
    expect(store.aiGenerationRuns).toEqual([{ id: "run1", status: "succeeded" }]);
    expect(store.aiSettings).toEqual({ generationEnabled: true, servingEnabled: false, questionsPerRun: 2 });
    expect(store.aiChapterSplits[3]).toEqual({ humanTotal: 20, humanFree: 5, aiTotal: 1, aiFree: 0 });
    expect(store.aiHasLoaded).toBe(true);
    expect(store.aiLoading).toBe(false);
  });

  it("fetchAiPendingQuestions reports a failure without throwing", async () => {
    callableMap.getAiPendingQuestions = vi.fn().mockRejectedValue(new Error("Failed to load AI questions"));
    const store = useAdminStore();

    await expect(store.fetchAiPendingQuestions()).resolves.toBeUndefined();

    expect(store.aiHasLoaded).toBe(false);
    expect(store.aiLoading).toBe(false);
    expect(showNotification).toHaveBeenCalledWith("Error loading AI questions: Failed to load AI questions", "error");
  });

  it("approveAiQuestion sends the edits, removes the question and updates the chapter split", async () => {
    const store = await storeWithPendingQuestions();
    callableMap.approveAiQuestion = vi.fn().mockResolvedValue({
      data: { success: true, chapter: 3, questionNumber: 2, alreadyInRepo: false },
    });
    const editedQuestion = { question: "Edited?", choices: ["A", "B", "C", "D"], correctChoice: 1, explanation: "Correct Answer: 2" };

    const result = await store.approveAiQuestion({ pendingQuestionId: "p1", editedQuestion, premium: false });

    expect(callableMap.approveAiQuestion).toHaveBeenCalledWith({ pendingQuestionId: "p1", editedQuestion, premium: false });
    expect(result).toEqual({ success: true, chapter: 3, questionNumber: 2, alreadyInRepo: false });
    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p2"]);
    expect(store.aiChapterSplits[3]).toEqual({ humanTotal: 20, humanFree: 5, aiTotal: 2, aiFree: 1 });
    expect(showNotification).toHaveBeenCalledWith("Approved as AI question 2 in chapter 3", "success");
  });

  it("approveAiQuestion keeps the question and rethrows on failure", async () => {
    const store = await storeWithPendingQuestions();
    callableMap.approveAiQuestion = vi.fn().mockRejectedValue(new Error("Chapter 3 is being updated right now."));

    await expect(store.approveAiQuestion({ pendingQuestionId: "p1", editedQuestion: {}, premium: true }))
      .rejects.toThrow("Chapter 3 is being updated right now.");

    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p1", "p2"]);
    expect(store.aiChapterSplits[3].aiTotal).toBe(1);
    expect(showNotification).toHaveBeenLastCalledWith("Error approving AI question: Chapter 3 is being updated right now.", "error");
  });

  it("rejectAiQuestion sends the reason and removes the question", async () => {
    const store = await storeWithPendingQuestions();
    callableMap.rejectAiQuestion = vi.fn().mockResolvedValue({ data: { success: true } });

    await store.rejectAiQuestion({ pendingQuestionId: "p2", rejectionReason: "Too easy" });

    expect(callableMap.rejectAiQuestion).toHaveBeenCalledWith({ pendingQuestionId: "p2", rejectionReason: "Too easy" });
    expect(store.aiPendingQuestions.map((q) => q.id)).toEqual(["p1"]);
  });

  it("updateAiSettings stores the settings the server saved", async () => {
    const store = await storeWithPendingQuestions();
    const savedSettings = { generationEnabled: true, servingEnabled: true, questionsPerRun: 5 };
    callableMap.updateAiSettings = vi.fn().mockResolvedValue({ data: { settings: savedSettings } });

    await store.updateAiSettings({ servingEnabled: true, questionsPerRun: 5 });

    expect(callableMap.updateAiSettings).toHaveBeenCalledWith({ servingEnabled: true, questionsPerRun: 5 });
    expect(store.aiSettings).toEqual(savedSettings);
  });

  it("updateAiSettings rethrows on failure", async () => {
    const store = await storeWithPendingQuestions();
    callableMap.updateAiSettings = vi.fn().mockRejectedValue(new Error("invalid"));

    await expect(store.updateAiSettings({ questionsPerRun: 11 })).rejects.toThrow("invalid");
    expect(store.aiSettings.questionsPerRun).toBe(2);
  });

  it("generateAiQuestionsNow uses a 1800000 ms timeout and refreshes the queue after a live run", async () => {
    const store = await storeWithPendingQuestions();
    const runResult = {
      runId: "run2",
      chapter: 5,
      dryRun: false,
      requestedQuestionCount: 2,
      generatedQuestionCount: 2,
      status: "succeeded",
      errors: [],
      questions: [],
    };
    callableMap.generateAiQuestionsNow = vi.fn().mockResolvedValue({ data: runResult });
    callableMap.getAiPendingQuestions.mockClear();

    const result = await store.generateAiQuestionsNow({ chapter: 5, questionCount: 2, dryRun: false });

    expect(httpsCallable).toHaveBeenCalledWith({}, "generateAiQuestionsNow", { timeout: 1800000 });
    expect(callableMap.generateAiQuestionsNow).toHaveBeenCalledWith({ chapter: 5, questionCount: 2, dryRun: false });
    expect(result).toEqual(runResult);
    expect(callableMap.getAiPendingQuestions).toHaveBeenCalledTimes(1);
  });

  it("generateAiQuestionsNow does not refresh the queue after a dry run", async () => {
    const store = await storeWithPendingQuestions();
    callableMap.generateAiQuestionsNow = vi.fn().mockResolvedValue({
      data: { runId: "run3", chapter: 5, dryRun: true, status: "succeeded", errors: [], questions: [] },
    });
    callableMap.getAiPendingQuestions.mockClear();

    await store.generateAiQuestionsNow({ chapter: null, questionCount: null, dryRun: true });

    expect(callableMap.generateAiQuestionsNow).toHaveBeenCalledWith({ chapter: null, questionCount: null, dryRun: true });
    expect(callableMap.getAiPendingQuestions).not.toHaveBeenCalled();
  });

  it("generateAiQuestionsNow rethrows on failure", async () => {
    const store = await storeWithPendingQuestions();
    callableMap.generateAiQuestionsNow = vi.fn().mockRejectedValue(new Error("A generation run is already in progress"));

    await expect(store.generateAiQuestionsNow({ chapter: null, questionCount: null, dryRun: false }))
      .rejects.toThrow("A generation run is already in progress");
    expect(showNotification).toHaveBeenLastCalledWith(
      "Error generating AI questions: A generation run is already in progress",
      "error",
    );
  });

  it("clearData resets the AI state", async () => {
    const store = await storeWithPendingQuestions();

    store.clearData();

    expect(store.aiPendingQuestions).toEqual([]);
    expect(store.aiGenerationRuns).toEqual([]);
    expect(store.aiSettings).toEqual({ generationEnabled: false, servingEnabled: false, questionsPerRun: 1 });
    expect(store.aiChapterSplits).toEqual({});
    expect(store.aiHasLoaded).toBe(false);
  });
});
