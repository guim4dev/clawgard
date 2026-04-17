package server_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/clawgard/clawgard/server/internal/config"
	"github.com/clawgard/clawgard/server/internal/server"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/stretchr/testify/require"
)

func TestServerStartsAndServesHealthz(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	dsn := testsupport.StartPostgres(t)
	cfg := config.Config{
		HTTPAddr:          "127.0.0.1:0",
		DatabaseURL:       dsn,
		ThreadIdleSeconds: 600,
		SweeperInterval:   10 * time.Second,
		DevMode:           true,
		DevAdminKey:       "dev-admin-key",
		LogLevel:          "error",
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	srv, err := server.New(ctx, cfg)
	require.NoError(t, err)

	go func() { _ = srv.Run(ctx) }()
	require.Eventually(t, func() bool {
		addr := srv.Addr()
		if addr == "" {
			return false
		}
		resp, err := http.Get("http://" + addr + "/healthz")
		if err != nil {
			return false
		}
		defer resp.Body.Close()
		return resp.StatusCode == http.StatusOK
	}, 5*time.Second, 50*time.Millisecond)
}
