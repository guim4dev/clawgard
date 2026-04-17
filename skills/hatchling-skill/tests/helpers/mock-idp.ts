import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

export interface MockRelay {
  url: string;
  close: () => Promise<void>;
  setIssuedToken: (token: string, email?: string) => void;
  pollsBeforeSuccess: (n: number) => void;
}

export async function startMockRelay(): Promise<MockRelay> {
  let pollsBeforeSuccess = 0;
  let pollCount = 0;
  let token = "mock-access-token";
  let email = "user@example.com";

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/auth/oidc/device" && req.method === "POST") {
        res.statusCode = 200;
        res.end(JSON.stringify({
          deviceCode: "DC-MOCK",
          userCode: "TEST-CODE",
          verificationUri: "http://idp.mock/activate",
          interval: 1,
          expiresIn: 60,
        }));
        return;
      }
      if (req.url === "/v1/auth/oidc/token" && req.method === "POST") {
        pollCount++;
        if (pollCount <= pollsBeforeSuccess) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: "authorization_pending", message: "" }));
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify({
          accessToken: token,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          email,
        }));
        return;
      }
      if (req.url === "/v1/buddies" && req.method === "GET") {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${token}`) {
          res.statusCode = 401;
          res.end(JSON.stringify({ code: "unauthorized", message: "bad token" }));
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify([{
          id: "00000000-0000-0000-0000-000000000001",
          name: "test-buddy",
          description: "a buddy",
          acl: { mode: "public" },
          ownerEmail: "owner@example.com",
          createdAt: new Date().toISOString(),
          online: true,
        }]));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: "not_found", message: req.url ?? "" }));
    });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((r) => server.close(() => r())),
    setIssuedToken: (t, e) => { token = t; if (e) email = e; },
    pollsBeforeSuccess: (n) => { pollsBeforeSuccess = n; pollCount = 0; },
  };
}
