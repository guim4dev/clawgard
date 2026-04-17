import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { initiateDeviceCode, pollForToken } from "../src/lib/oidc.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("initiateDeviceCode", () => {
  it("posts to /v1/auth/oidc/device and returns the challenge", async () => {
    server.use(
      http.post("https://relay.test/v1/auth/oidc/device", () =>
        HttpResponse.json({
          deviceCode: "DC",
          userCode: "ABCD-EFGH",
          verificationUri: "https://idp.example/activate",
          interval: 5,
          expiresIn: 600,
        }),
      ),
    );
    const ch = await initiateDeviceCode("https://relay.test");
    expect(ch.userCode).toBe("ABCD-EFGH");
    expect(ch.interval).toBe(5);
  });
});

describe("pollForToken", () => {
  it("returns the token once the IdP reports success", async () => {
    let hits = 0;
    server.use(
      http.post("https://relay.test/v1/auth/oidc/token", async () => {
        hits++;
        if (hits < 3) {
          return HttpResponse.json(
            { code: "authorization_pending", message: "wait" },
            { status: 400 },
          );
        }
        return HttpResponse.json({
          accessToken: "tok",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          email: "u@example.com",
        });
      }),
    );
    const out = await pollForToken({
      baseUrl: "https://relay.test",
      deviceCode: "DC",
      intervalSeconds: 0.01,
      expiresInSeconds: 5,
    });
    expect(out.accessToken).toBe("tok");
    expect(hits).toBe(3);
  });

  it("backs off on slow_down by adding 5s (RFC 8628)", async () => {
    const sleeps: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    // Intercept sleep timers invoked with exact whole-second values used by
    // pollForToken (2s, 7s, etc.), fire the callback synchronously, and
    // delegate everything else (including apiFetch's AbortController timer)
    // to the real scheduler.
    const pollSleeps = new Set([2000, 7000, 12000]);
    const spy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((fn: () => void, ms?: number) => {
        if (pollSleeps.has(ms ?? -1)) {
          sleeps.push(ms ?? 0);
          fn();
          return 0 as unknown as NodeJS.Timeout;
        }
        return realSetTimeout(fn, ms);
      }) as typeof setTimeout);

    try {
      let hits = 0;
      server.use(
        http.post("https://relay.test/v1/auth/oidc/token", async () => {
          hits++;
          if (hits === 1)
            return HttpResponse.json(
              { code: "authorization_pending", message: "" },
              { status: 400 },
            );
          if (hits === 2)
            return HttpResponse.json({ code: "slow_down", message: "" }, { status: 400 });
          return HttpResponse.json({
            accessToken: "tok",
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          });
        }),
      );

      await pollForToken({
        baseUrl: "https://relay.test",
        deviceCode: "DC",
        intervalSeconds: 2,
        expiresInSeconds: 60,
      });

      // First wait 2s (before pending), second wait 2s (no backoff yet —
      // RFC 8628 only bumps interval on slow_down), third wait 2+5=7s after
      // slow_down. Sequence: pending → slow_down → success.
      expect(sleeps).toEqual([2000, 2000, 7000]);
    } finally {
      spy.mockRestore();
    }
  });

  it("throws on expired_token", async () => {
    server.use(
      http.post("https://relay.test/v1/auth/oidc/token", () =>
        HttpResponse.json({ code: "expired_token", message: "gone" }, { status: 400 }),
      ),
    );
    await expect(
      pollForToken({
        baseUrl: "https://relay.test",
        deviceCode: "DC",
        intervalSeconds: 0.01,
        expiresInSeconds: 5,
      }),
    ).rejects.toThrow(/device code expired/i);
  });

  it("throws on local timeout when expiresInSeconds elapses", async () => {
    server.use(
      http.post("https://relay.test/v1/auth/oidc/token", () =>
        HttpResponse.json({ code: "authorization_pending", message: "" }, { status: 400 }),
      ),
    );
    await expect(
      pollForToken({
        baseUrl: "https://relay.test",
        deviceCode: "DC",
        intervalSeconds: 0.01,
        expiresInSeconds: 0.03,
      }),
    ).rejects.toThrow(/login timed out/i);
  });
});
