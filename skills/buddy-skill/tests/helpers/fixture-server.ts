import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface FixtureServer {
  url: (path: string) => string;
  close: () => Promise<void>;
}

export async function startFixtureServer(rootDir: string): Promise<FixtureServer> {
  const server = await new Promise<Server>((resolve) => {
    const s = createServer(async (req, res) => {
      try {
        const p = new URL(req.url ?? "/", "http://x").pathname;
        if (p === "/500") {
          res.statusCode = 500;
          return res.end("boom");
        }
        const buf = await readFile(join(rootDir, p));
        res.statusCode = 200;
        res.setHeader("content-type", "application/octet-stream");
        res.setHeader("content-length", String(buf.byteLength));
        res.end(buf);
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
    }).listen(0, () => resolve(s));
  });
  const { port } = server.address() as { port: number };
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
