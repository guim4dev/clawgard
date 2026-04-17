import { apiFetch } from "../../src/lib/http.js";

export async function provisionBuddy(
  relayUrl: string,
  adminToken: string,
  buddy: { name: string; description: string; acl: { mode: "public" } },
): Promise<{ id: string; apiKey: string }> {
  const created = await apiFetch<{ buddy: { id: string }; apiKey: string }>({
    baseUrl: relayUrl,
    path: "/v1/admin/buddies",
    method: "POST",
    token: adminToken,
    body: buddy,
  });

  // Start an in-process echo-buddy that connects to the WS endpoint.
  // Node 22's global WebSocket is used here; the server accepts the bearer
  // token either from the Authorization header or from a ?token= query
  // parameter — we use the query form since global WebSocket does not
  // accept custom headers.
  const wsUrl = `${relayUrl.replace(/^http/, "ws")}/v1/buddy/connect?token=${encodeURIComponent(created.apiKey)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws: any = new (globalThis as unknown as { WebSocket: new (u: string) => unknown }).WebSocket(wsUrl);

  ws.addEventListener("message", (evt: { data: string }) => {
    const frame = JSON.parse(evt.data);
    if (frame.type === "question") {
      ws.send(JSON.stringify({
        type: "answer",
        threadId: frame.threadId,
        content: `pong: ${frame.content}`,
      }));
    }
  });

  await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));

  return { id: created.buddy.id, apiKey: created.apiKey };
}
