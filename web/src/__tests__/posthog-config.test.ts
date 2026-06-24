import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock posthog-js so we can assert whether posthog.init/capture/identify are
// called, and capture the options passed to them, without making any network
// calls or depending on a real PostHog environment.
const initMock = vi.fn();
const captureMock = vi.fn();
const identifyMock = vi.fn();
const resetMock = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init: (...args: unknown[]) => initMock(...args),
    capture: (...args: unknown[]) => captureMock(...args),
    identify: (...args: unknown[]) => identifyMock(...args),
    reset: (...args: unknown[]) => resetMock(...args),
  },
}));

// Mock posthog-node so we can assert whether capture/flush are called on the
// server-side client without making any network calls.
const nodeCaptureMock = vi.fn();
const nodeFlushMock = vi.fn().mockResolvedValue(undefined);
const nodeShutdownMock = vi.fn().mockResolvedValue(undefined);

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: (...args: unknown[]) => nodeCaptureMock(...args),
    flush: (...args: unknown[]) => nodeFlushMock(...args),
    shutdown: (...args: unknown[]) => nodeShutdownMock(...args),
  })),
}));

describe("posthog client smoke tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    initMock.mockClear();
    captureMock.mockClear();
    identifyMock.mockClear();
    resetMock.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("no-ops when NEXT_PUBLIC_POSTHOG_KEY is unset", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const { initPostHogClient } = await import("../lib/posthog/client");
    initPostHogClient();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("calls posthog.init when NEXT_PUBLIC_POSTHOG_KEY is set, with autocapture and capture_pageview disabled", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test123";
    const { initPostHogClient } = await import("../lib/posthog/client");
    initPostHogClient();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0][0]).toBe("phc_test123");
    const opts = initMock.mock.calls[0][1];
    expect(opts.autocapture).toBe(false);
    expect(opts.capture_pageview).toBe(false);
  });

  it("does NOT call posthog.init when subly_cookie_consent is 'declined', even with a key set", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test123";
    window.localStorage.setItem("subly_cookie_consent", "declined");
    const { initPostHogClient } = await import("../lib/posthog/client");
    initPostHogClient();
    expect(initMock).not.toHaveBeenCalled();
    window.localStorage.removeItem("subly_cookie_consent");
  });

  it("calls posthog.init when subly_cookie_consent is 'accepted' and a key is set", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test123";
    window.localStorage.setItem("subly_cookie_consent", "accepted");
    const { initPostHogClient } = await import("../lib/posthog/client");
    initPostHogClient();
    expect(initMock).toHaveBeenCalledTimes(1);
    window.localStorage.removeItem("subly_cookie_consent");
  });

  it("capture() no-ops when not initialized", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const { capture } = await import("../lib/posthog/client");
    expect(() => capture("message_sent", { foo: "bar" })).not.toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("capture() calls posthog.capture with event name and properties when initialized", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test123";
    const { initPostHogClient, capture } = await import("../lib/posthog/client");
    initPostHogClient();
    capture("listing_created", { rent_cents: 120000 });
    expect(captureMock).toHaveBeenCalledWith("listing_created", { rent_cents: 120000 });
  });

  it("capture() swallows errors thrown by posthog.capture", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test123";
    captureMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const { initPostHogClient, capture } = await import("../lib/posthog/client");
    initPostHogClient();
    expect(() => capture("payment_completed")).not.toThrow();
  });

  it("identify() calls posthog.identify with distinct ID and properties when initialized", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test123";
    const { initPostHogClient, identify } = await import("../lib/posthog/client");
    initPostHogClient();
    identify("user_123", { university: "UT Austin" });
    expect(identifyMock).toHaveBeenCalledWith("user_123", { university: "UT Austin" });
  });

  it("identify() no-ops when not initialized", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const { identify } = await import("../lib/posthog/client");
    expect(() => identify("user_123")).not.toThrow();
    expect(identifyMock).not.toHaveBeenCalled();
  });
});

describe("posthog server smoke tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    nodeCaptureMock.mockClear();
    nodeFlushMock.mockClear();
    nodeShutdownMock.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("captureServer no-ops when both POSTHOG_API_KEY and NEXT_PUBLIC_POSTHOG_KEY are unset", async () => {
    delete process.env.POSTHOG_API_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const { captureServer } = await import("../lib/posthog/server");
    await captureServer({ distinctId: "user_1", event: "payment_completed" });
    expect(nodeCaptureMock).not.toHaveBeenCalled();
    expect(nodeFlushMock).not.toHaveBeenCalled();
  });

  it("captureServer calls capture and flush when a key is set", async () => {
    process.env.POSTHOG_API_KEY = "phc_server_test";
    const { captureServer } = await import("../lib/posthog/server");
    await captureServer({
      distinctId: "user_1",
      event: "payment_completed",
      properties: { amount_cents: 4900 },
    });
    expect(nodeCaptureMock).toHaveBeenCalledWith({
      distinctId: "user_1",
      event: "payment_completed",
      properties: { amount_cents: 4900 },
    });
    expect(nodeFlushMock).toHaveBeenCalledTimes(1);
  });

  it("captureServer swallows errors from capture and resolves without rejecting", async () => {
    process.env.POSTHOG_API_KEY = "phc_server_test";
    nodeCaptureMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const { captureServer } = await import("../lib/posthog/server");
    await expect(
      captureServer({ distinctId: "user_1", event: "payment_completed" })
    ).resolves.toBeUndefined();
  });
});
