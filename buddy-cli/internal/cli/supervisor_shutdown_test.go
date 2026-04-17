package cli

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/require"

	"github.com/clawgard/clawgard/buddy-cli/internal/client"
	"github.com/clawgard/clawgard/buddy-cli/internal/hook"
)

func TestSupervisor_CancelsOnCtxDone(t *testing.T) {
	var reached int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&reached, 1)
		c, _ := websocket.Accept(w, r, nil)
		<-r.Context().Done()
		c.Close(websocket.StatusNormalClosure, "")
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/buddy/connect"
	ctx, cancel := context.WithCancel(context.Background())

	dialer := client.New(client.Options{RelayURL: wsURL, APIKey: "k"})
	runner := hook.NewRunner(hook.RunnerOptions{Command: "/bin/true", Timeout: time.Second})

	done := make(chan error, 1)
	go func() {
		done <- RunSupervisor(ctx, SupervisorDeps{
			Dialer:  dialer,
			Runner:  runner,
			Backoff: client.NewBackoff(client.BackoffConfig{Initial: 50 * time.Millisecond, Max: 100 * time.Millisecond}),
		})
	}()

	require.Eventually(t, func() bool { return atomic.LoadInt32(&reached) >= 1 }, 2*time.Second, 50*time.Millisecond)
	cancel()
	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(2 * time.Second):
		t.Fatal("supervisor did not return after cancel")
	}
}
