package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/clawgard/clawgard/buddy-cli/internal/client"
	"github.com/clawgard/clawgard/buddy-cli/internal/hook"
)

type SupervisorDeps struct {
	Dialer  *client.Client
	Runner  *hook.Runner
	Backoff *client.Backoff // optional; default 1s..30s ±20%
}

func RunSupervisor(ctx context.Context, d SupervisorDeps) error {
	bo := d.Backoff
	if bo == nil {
		bo = client.NewBackoff(client.BackoffConfig{
			Initial: 1 * time.Second,
			Max:     30 * time.Second,
			Jitter:  0.2,
			Rand:    rand.New(rand.NewSource(time.Now().UnixNano())),
		})
	}
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		err := runOnce(ctx, d)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err == nil {
			bo.Reset()
			continue
		}
		wait := bo.Next()
		fmt.Fprintf(stderr(), "buddy: disconnected (%v), retrying in %s\n", err, wait)
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func runOnce(ctx context.Context, d SupervisorDeps) error {
	conn, err := d.Dialer.Dial(ctx)
	if err != nil {
		return err
	}
	session := client.NewSession(conn)

	dispatch := func(f client.InFrame) {
		go handleFrame(ctx, session, d.Runner, f)
	}
	runErr := session.Run(ctx, dispatch)
	return runErr
}

func handleFrame(ctx context.Context, s *client.Session, r *hook.Runner, f client.InFrame) {
	if f.Type != "question" && f.Type != "clarification" {
		return
	}
	q := hook.Question{
		ThreadID:   f.ThreadID,
		Question:   f.Content,
		AskerEmail: f.AskerEmail,
		Turn:       1, // server controls turn numbering via frame order
	}
	if f.Type == "clarification" {
		q.Turn = 2
	}
	resp, err := r.Run(ctx, q)
	if err != nil {
		reason := "buddy_hook_error"
		if errors.Is(err, hook.ErrInvalidResponse) {
			reason = "buddy_hook_invalid_response"
		}
		_ = s.Send(ctx, client.OutFrame{Type: "close", ThreadID: f.ThreadID, Reason: reason})
		return
	}
	out := client.OutFrame{Type: resp.Type, ThreadID: f.ThreadID, Content: resp.Content}
	if _, err := json.Marshal(out); err != nil {
		return
	}
	_ = s.Send(ctx, out)
}
