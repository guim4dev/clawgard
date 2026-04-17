import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

export interface MockIdp {
  issuer: string;
  close: () => Promise<void>;
  adminToken: () => string;
}

export async function startMockIdp(): Promise<MockIdp> {
  const adminTok = randomUUID();
  const s: Server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/.well-known/openid-configuration") {
      const host = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
      res.end(JSON.stringify({
        issuer: host,
        device_authorization_endpoint: `${host}/device`,
        token_endpoint: `${host}/token`,
        jwks_uri: `${host}/jwks`,
      }));
      return;
    }
    if (req.url === "/device") {
      res.end(JSON.stringify({
        device_code: "DC",
        user_code: "TEST-CODE",
        verification_uri: `http://localhost/verify`,
        interval: 1,
        expires_in: 60,
      }));
      return;
    }
    if (req.url === "/token") {
      res.end(JSON.stringify({
        access_token: adminTok,
        token_type: "Bearer",
        expires_in: 3600,
        id_token: "fake.jwt.token",
      }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  return {
    issuer: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => s.close(() => r())),
    adminToken: () => adminTok,
  };
}
