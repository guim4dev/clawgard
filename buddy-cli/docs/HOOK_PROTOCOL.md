# clawgard-buddy hook protocol

The buddy daemon is framework-agnostic. To integrate an agent, point `--on-question` at any executable that reads a JSON question from stdin and writes a JSON answer to stdout.

## Invocation

- The daemon splits the `--on-question` value with POSIX-style `shlex`. Quote arguments that contain spaces.
- For each question the daemon spawns a **fresh subprocess**.
- Cross-platform: Go's `os/exec` is used, so the same contract works on Linux, macOS, and Windows.

## Stdin (one JSON object)

```json
{
  "threadId": "11111111-1111-1111-1111-111111111111",
  "question": "How do I deploy the staging cluster?",
  "askerEmail": "alice@acme.internal",
  "turn": 1
}
```

- `turn` is `1` for the initial question, `2` or `3` for clarifications.

## Stdout (one JSON object)

```json
{
  "type": "answer",
  "content": "Run `make deploy-staging`."
}
```

- `type` is one of: `answer`, `clarification_request`, `close`.
- `content` is the message body (markdown allowed).

## Error handling

- Exit non-zero or write invalid/missing JSON → the daemon emits a `close` frame with `reason: "buddy_hook_error"` (or `buddy_hook_invalid_response`) and moves on. The thread is closed from the server's perspective.
- Exceed `--question-timeout` (default 120s) → the daemon kills the subprocess and emits `close` with reason `buddy_hook_error`.

## Example (Python)

```python
import json, sys
q = json.loads(sys.stdin.read())
answer = f"You asked: {q['question']}"
print(json.dumps({"type": "answer", "content": answer}))
```

Invoke:

```bash
clawgard-buddy listen --on-question "python3 hook.py"
```

## Example (Node)

```js
const chunks = [];
process.stdin.on("data", c => chunks.push(c));
process.stdin.on("end", () => {
  const q = JSON.parse(Buffer.concat(chunks).toString());
  process.stdout.write(JSON.stringify({ type: "answer", content: `You asked: ${q.question}` }));
});
```

## Notes

- Do not emit any non-JSON output on stdout — use stderr for logging. The daemon reads and parses stdout in full.
- On Windows, stdin EOF semantics differ from Unix; rely on `process.stdin.on("end", ...)` rather than `read until EOF` shell idioms.
- Never pipe through a shell. Use `node hook.js` or `python hook.py`, not `sh -c "..."`.
