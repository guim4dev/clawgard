import { apiFetch, HttpError } from "./http.js";
import type { OidcDeviceChallenge, OidcTokenResponse } from "../types.js";

export async function initiateDeviceCode(baseUrl: string): Promise<OidcDeviceChallenge> {
  return apiFetch<OidcDeviceChallenge>({
    baseUrl,
    path: "/v1/auth/oidc/device",
    method: "POST",
  });
}

export interface PollInput {
  baseUrl: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

export async function pollForToken(input: PollInput): Promise<OidcTokenResponse> {
  const deadline = Date.now() + input.expiresInSeconds * 1000;
  let interval = input.intervalSeconds;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    try {
      return await apiFetch<OidcTokenResponse>({
        baseUrl: input.baseUrl,
        path: "/v1/auth/oidc/token",
        method: "POST",
        body: { deviceCode: input.deviceCode },
        // Long enough to let the relay proxy the IdP; shorter than typical.
        timeoutMs: 15_000,
      });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      switch (err.code) {
        case "authorization_pending":
          continue;
        case "slow_down":
          interval += 5;
          continue;
        case "expired_token":
          throw new Error("device code expired — run setup again");
        default:
          throw err;
      }
    }
  }
  throw new Error("login timed out — run setup again");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
