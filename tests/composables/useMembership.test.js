import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpsCallable } from "firebase/functions";

const mockUserRef = { value: null };
const mockCallable = vi.fn();

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => mockCallable),
}));

vi.mock("../../src/config/firebaseConfig", () => ({
  firebaseApp: {},
}));

vi.mock("pinia", () => ({
  storeToRefs: () => ({ user: mockUserRef }),
}));

vi.mock("../../src/composables/useAuth", () => ({
  useAuthStore: vi.fn(() => ({})),
}));

vi.mock("../../src/composables/useNotifier", () => ({
  showNotification: vi.fn(),
}));

import useMembership from "../../src/composables/useMembership";

describe("useMembership", () => {
  beforeEach(() => {
    mockUserRef.value = null;
    mockCallable.mockReset();
    httpsCallable.mockClear();
    vi.stubGlobal("location", { origin: "http://localhost", href: "" });
  });

  it("throws when user is unauthenticated for checkout", async () => {
    const { startCheckout } = useMembership();
    await expect(startCheckout("Monthly")).rejects.toThrow("User is not authenticated");
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("starts checkout and redirects when user is present", async () => {
    mockUserRef.value = { uid: "u1" };
    mockCallable.mockResolvedValue({ data: { url: "https://example.com/checkout" } });
    const { startCheckout } = useMembership();

    await startCheckout("Monthly");

    expect(httpsCallable).toHaveBeenCalledWith({}, "createCheckoutSession");
    expect(window.location.href).toBe("https://example.com/checkout");
  });

  it("manages subscription and redirects when user is present", async () => {
    mockUserRef.value = { uid: "u1" };
    mockCallable.mockResolvedValue({ data: { url: "https://example.com/portal" } });
    const { manageSubscription } = useMembership();

    await manageSubscription();

    expect(httpsCallable).toHaveBeenCalledWith({}, "manageSubscription");
    expect(window.location.href).toBe("https://example.com/portal");
  });
});
