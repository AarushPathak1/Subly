import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @sentry/nextjs so we can assert whether Sentry.init is called, and
// capture the options passed to it, without making any network calls or
// depending on a real Sentry environment.
const initMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  init: (...args: unknown[]) => initMock(...args),
}));

describe("sentry client/server/edge config smoke tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    initMock.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sentry.client.config no-ops when NEXT_PUBLIC_SENTRY_DSN is unset", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    await import("../../sentry.client.config");
    expect(initMock).not.toHaveBeenCalled();
  });

  it("sentry.client.config calls Sentry.init when NEXT_PUBLIC_SENTRY_DSN is set", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example.ingest.sentry.io/123";
    await import("../../sentry.client.config");
    expect(initMock).toHaveBeenCalledTimes(1);
    const opts = initMock.mock.calls[0][0];
    expect(opts.dsn).toBe("https://example.ingest.sentry.io/123");
    expect(opts.sendDefaultPii).toBe(false);
  });

  it("sentry.server.config no-ops when SENTRY_DSN is unset", async () => {
    delete process.env.SENTRY_DSN;
    await import("../../sentry.server.config");
    expect(initMock).not.toHaveBeenCalled();
  });

  it("sentry.server.config calls Sentry.init when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://example.ingest.sentry.io/456";
    await import("../../sentry.server.config");
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0][0].dsn).toBe("https://example.ingest.sentry.io/456");
  });

  it("sentry.edge.config no-ops when SENTRY_DSN is unset", async () => {
    delete process.env.SENTRY_DSN;
    await import("../../sentry.edge.config");
    expect(initMock).not.toHaveBeenCalled();
  });

  it("sentry.edge.config calls Sentry.init when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://example.ingest.sentry.io/789";
    await import("../../sentry.edge.config");
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0][0].dsn).toBe("https://example.ingest.sentry.io/789");
  });

  it("client config's beforeSend strips Authorization and Cookie headers", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example.ingest.sentry.io/123";
    await import("../../sentry.client.config");
    const opts = initMock.mock.calls[0][0];

    const event = {
      request: {
        headers: {
          Authorization: "Bearer secret-token",
          authorization: "Bearer secret-token-lowercase",
          Cookie: "session=abc",
          cookie: "session=abc-lowercase",
          "Content-Type": "application/json",
        },
      },
    };

    const result = opts.beforeSend(event);
    expect(result.request.headers.Authorization).toBeUndefined();
    expect(result.request.headers.authorization).toBeUndefined();
    expect(result.request.headers.Cookie).toBeUndefined();
    expect(result.request.headers.cookie).toBeUndefined();
    expect(result.request.headers["Content-Type"]).toBe("application/json");
  });

  it("client config's beforeSend is a no-op when there are no request headers", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example.ingest.sentry.io/123";
    await import("../../sentry.client.config");
    const opts = initMock.mock.calls[0][0];

    const event = { message: "no request object" };
    const result = opts.beforeSend(event);
    expect(result).toBe(event);
  });
});
