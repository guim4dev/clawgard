package sweeper

import (
	"context"
	"log/slog"
	"time"

	"github.com/clawgard/clawgard/server/internal/store"
)

type Sweeper struct {
	s        *store.Store
	interval time.Duration
	idle     time.Duration
}

func New(s *store.Store, interval, idle time.Duration) *Sweeper {
	return &Sweeper{s: s, interval: interval, idle: idle}
}

// Run loops until ctx is done, calling RunOnce at `interval`.
func (sw *Sweeper) Run(ctx context.Context) {
	t := time.NewTicker(sw.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			sw.RunOnce(ctx)
		}
	}
}

// RunOnce closes any threads whose last_activity_at is older than idle.
func (sw *Sweeper) RunOnce(ctx context.Context) {
	cutoff := time.Now().Add(-sw.idle)
	threads, err := sw.s.Threads().ListIdleOpen(ctx, cutoff)
	if err != nil {
		slog.Error("sweeper list failed", "err", err)
		return
	}
	for _, th := range threads {
		if err := sw.s.Threads().Close(ctx, th.ID, "idle_timeout"); err != nil {
			slog.Error("sweeper close failed", "thread", th.ID, "err", err)
		}
	}
}
