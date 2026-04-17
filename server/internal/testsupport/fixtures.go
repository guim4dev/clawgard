package testsupport

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	pg "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// StartPostgres spins up a Postgres 15 container for the duration of the test
// and returns its connection string. The container is terminated on t.Cleanup.
func StartPostgres(t *testing.T) string {
	t.Helper()
	ctx := context.Background()

	container, err := pg.Run(ctx,
		"postgres:15-alpine",
		pg.WithDatabase("clawgard"),
		pg.WithUsername("clawgard"),
		pg.WithPassword("clawgard"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = container.Terminate(ctx)
	})

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	return dsn
}
