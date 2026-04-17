package cli

import (
	"context"
	"net/http"
	"net/http/httptest"
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
