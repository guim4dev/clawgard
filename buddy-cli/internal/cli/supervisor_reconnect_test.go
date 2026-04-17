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

func TestSupervisor_ReconnectsAfterDrop(t *testing.T) {
	var connectCount int32
	dropFirst := make(chan struct{})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&connectCount, 1)
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		if n == 1 {
			// drop immediately
			close(dropFirst)
			c.Close(websocket.StatusGoingAway, "server restart")
			return
		}
		// on second connect, keep open briefly
		time.Sleep(500 * time.Millisecond)
		c.Close(websocket.StatusNormalClosure, "")
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/buddy/connect"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	dialer := client.New(client.Options{RelayURL: wsURL, APIKey: "k"})
	runner := hook.NewRunner(hook.RunnerOptions{Command: "/bin/true", Timeout: time.Second})

	bo := client.NewBackoff(client.BackoffConfig{Initial: 50 * time.Millisecond, Max: 200 * time.Millisecond})
	go func() { _ = RunSupervisor(ctx, SupervisorDeps{Dialer: dialer, Runner: runner, Backoff: bo}) }()

	<-dropFirst
	require.Eventually(t, func() bool { return atomic.LoadInt32(&connectCount) >= 2 }, 4*time.Second, 100*time.Millisecond)
}
