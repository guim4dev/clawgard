import { describe, it, expect } from "vitest";
import { HttpError, humanizeError } from "../src/lib/http.js";

describe("humanizeError", () => {
  it("401 suggests re-running setup", () => {
    const err = new HttpError(401, "unauthorized", "bad token");
    expect(humanizeError(err)).toMatch(/setup/);
  });

  it("403 explains ACL", () => {
    const err = new HttpError(403, "forbidden", "no access");
    expect(humanizeError(err)).toMatch(/not allowed/i);
  });

  it("404 suggests listing buddies", () => {
    const err = new HttpError(404, "not_found", "no such buddy");
    expect(humanizeError(err)).toMatch(/list/i);
  });

  it("network errors point at the relay URL", () => {
    const err = new HttpError(0, "network", "ECONNREFUSED");
    expect(humanizeError(err)).toMatch(/reach.*relay/i);
  });

  it("timeout tells the user to retry", () => {
    const err = new HttpError(0, "timeout", "timed out");
    expect(humanizeError(err)).toMatch(/retry/i);
  });

  it("unknown errors pass through the message", () => {
    const err = new HttpError(500, "internal", "boom");
    expect(humanizeError(err)).toMatch(/boom/);
  });
});
