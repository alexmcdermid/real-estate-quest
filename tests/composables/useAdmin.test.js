import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAdminStore } from "../../src/composables/useAdmin";

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
