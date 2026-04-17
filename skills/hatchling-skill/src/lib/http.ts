export interface ApiRequest<B = unknown> {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string;
  body?: B;
  timeoutMs?: number;
}

export class HttpError extends Error {
  readonly name = "HttpError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<R = unknown>(req: ApiRequest): Promise<R> {
  const url = new URL(req.path, req.baseUrl).toString();
  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? 30_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { accept: "application/json" };
  if (req.token) headers.authorization = `Bearer ${req.token}`;
  if (req.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method ?? "GET",
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      throw new HttpError(0, "timeout", `request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw new HttpError(0, "network", `network error calling ${url}: ${(err as Error).message}`);
  }
  clearTimeout(timeout);

  if (res.status === 204) return undefined as R;

  const text = await res.text();
  const parsed = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const code = (parsed && typeof parsed === "object" && "code" in parsed
      ? String((parsed as { code: unknown }).code)
      : `http_${res.status}`);
    const message = (parsed && typeof parsed === "object" && "message" in parsed
      ? String((parsed as { message: unknown }).message)
      : res.statusText);
    throw new HttpError(res.status, code, message, parsed);
  }

  return (parsed ?? {}) as R;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
