package cli

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/require"

	"github.com/clawgard/clawgard/buddy-cli/internal/client"
	"github.com/clawgard/clawgard/buddy-cli/internal/hook"
)

func TestHandleFrame_EmitsCloseOnHookFailure(t *testing.T) {
	gotFrames := make(chan string, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, _ := websocket.Accept(w, r, nil)
		go func() {
			for {
				_, data, err := c.Read(r.Context())
				if err != nil {
					return
				}
				gotFrames <- string(data)
			}
		}()
		_ = c.Write(r.Context(), websocket.MessageText,
			[]byte(`{"type":"question","threadId":"t-1","content":"hi","askerEmail":"a@b"}`))
		time.Sleep(500 * time.Millisecond)
		c.Close(websocket.StatusNormalClosure, "")
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/buddy/connect"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	c := client.New(client.Options{RelayURL: wsURL, APIKey: "k"})
	conn, err := c.Dial(ctx)
	require.NoError(t, err)
	session := client.NewSession(conn)

	r := hook.NewRunner(hook.RunnerOptions{Command: "/nonexistent/hook", Timeout: 500 * time.Millisecond})
	go session.Run(ctx, func(f client.InFrame) {
		go handleFrame(ctx, session, r, f)
	})

	select {
	case frame := <-gotFrames:
		require.Contains(t, frame, `"type":"close"`)
		require.Contains(t, frame, `"reason":"buddy_hook_error"`)
	case <-ctx.Done():
		t.Fatal("never received close frame")
	}
}

func TestHandleFrame_ClarificationIncrementsTurn(t *testing.T) {
	// Track turn passed to runner via a stubbed Runner-equivalent.
	// We test by building a hook that prints the turn it saw.
	bin := buildTurnEchoHook(t)

	gotFrames := make(chan string, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, _ := websocket.Accept(w, r, nil)
		go func() {
			for {
				_, data, err := c.Read(r.Context())
				if err != nil {
					return
				}
				gotFrames <- string(data)
			}
		}()
		// First: question (turn 1)
		_ = c.Write(r.Context(), websocket.MessageText,
			[]byte(`{"type":"question","threadId":"t-1","content":"q1","askerEmail":"a@b"}`))
		time.Sleep(200 * time.Millisecond)
		// Second: clarification (turn 2)
		_ = c.Write(r.Context(), websocket.MessageText,
			[]byte(`{"type":"clarification","threadId":"t-1","content":"q2","askerEmail":"a@b"}`))
		time.Sleep(300 * time.Millisecond)
		c.Close(websocket.StatusNormalClosure, "")
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/buddy/connect"
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	c := client.New(client.Options{RelayURL: wsURL, APIKey: "k"})
	conn, err := c.Dial(ctx)
	require.NoError(t, err)
	session := client.NewSession(conn)

	r := hook.NewRunner(hook.RunnerOptions{Command: bin, Timeout: 5 * time.Second})
	go session.Run(ctx, func(f client.InFrame) { go handleFrame(ctx, session, r, f) })

	turns := []string{}
	for len(turns) < 2 {
		select {
		case f := <-gotFrames:
			turns = append(turns, f)
		case <-ctx.Done():
			t.Fatalf("only got %d frames", len(turns))
		}
	}
	// Both hook invocations run concurrently via `go handleFrame`, so the
	// frame order on the wire is not deterministic. Assert both turn numbers
	// show up without depending on arrival order.
	joined := strings.Join(turns, "|")
	require.Contains(t, joined, `"content":"turn:1"`)
	require.Contains(t, joined, `"content":"turn:2"`)
}

func buildTurnEchoHook(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	src := dir + "/turn_echo.go"
	require.NoError(t, os.WriteFile(src, []byte(`//go:build ignore
package main
import (
	"encoding/json"
	"fmt"
	"os"
)
type in struct { Turn int `+"`json:\"turn\"`"+` }
type out struct { Type, Content string }
func main() {
	var q in
	_ = json.NewDecoder(os.Stdin).Decode(&q)
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{
		"type": "answer",
		"content": fmt.Sprintf("turn:%d", q.Turn),
	})
}
`), 0644))
	out := dir + "/turn_echo"
	if os.PathSeparator == '\\' {
		out += ".exe"
	}
	cmd := exec.Command("go", "build", "-o", out, src)
	b, err := cmd.CombinedOutput()
	require.NoError(t, err, string(b))
	return out
}
