package client

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/coder/websocket"
)

type Session struct {
	conn   *websocket.Conn
	writes chan writeReq
	once   sync.Once
	closed chan struct{}
}

type writeReq struct {
	frame OutFrame
	done  chan error
}

func NewSession(conn *websocket.Conn) *Session {
	return &Session{
		conn:   conn,
		writes: make(chan writeReq, 16),
		closed: make(chan struct{}),
	}
}

// Run blocks reading frames and dispatching them to handler.
// It also starts the single writer goroutine.
func (s *Session) Run(ctx context.Context, handler func(InFrame)) error {
	go s.writeLoop(ctx)
	defer s.shutdown()

	for {
		_, data, err := s.conn.Read(ctx)
		if err != nil {
			return err
		}
		var f InFrame
		if err := json.Unmarshal(data, &f); err != nil {
			// skip malformed frame; server bug — don't crash buddy
			continue
		}
		handler(f)
	}
}

func (s *Session) Send(ctx context.Context, f OutFrame) error {
	done := make(chan error, 1)
	select {
	case s.writes <- writeReq{frame: f, done: done}:
	case <-s.closed:
		return fmt.Errorf("session closed")
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Session) writeLoop(ctx context.Context) {
	for {
		select {
		case <-s.closed:
			return
		case req := <-s.writes:
			data, err := json.Marshal(req.frame)
			if err != nil {
				req.done <- err
				continue
			}
			req.done <- s.conn.Write(ctx, websocket.MessageText, data)
		}
	}
}

func (s *Session) shutdown() {
	s.once.Do(func() { close(s.closed) })
}
