package router

import (
	"context"
	"errors"
	"sync"

	"github.com/google/uuid"
)

// InFrame is what the server sends TO a buddy over the WebSocket.
type InFrame struct {
	Type       string `json:"type"` // question | clarification | close
	ThreadID   string `json:"threadId"`
	Content    string `json:"content,omitempty"`
	AskerEmail string `json:"askerEmail,omitempty"`
}

// OutFrame is what the server receives FROM a buddy.
type OutFrame struct {
	Type     string `json:"type"` // answer | clarification_request | close
	ThreadID string `json:"threadId"`
	Content  string `json:"content,omitempty"`
	Reason   string `json:"reason,omitempty"`
}

// ErrBuddyOffline is returned when no connected buddy matches the id.
var ErrBuddyOffline = errors.New("buddy offline")

type buddyEntry struct {
	writer func(InFrame)
	gen    uint64
}

// Registry tracks connected buddies and pending thread waiters.
type Registry struct {
	mu      sync.RWMutex
	buddies map[uuid.UUID]buddyEntry // keyed by buddy id
	gen     uint64
	waiters map[string]chan OutFrame // keyed by threadId
}

// NewRegistry returns a fresh registry.
func NewRegistry() *Registry {
	return &Registry{
		buddies: map[uuid.UUID]buddyEntry{},
		waiters: map[string]chan OutFrame{},
	}
}

// RegisterBuddy registers a buddy with its writer callback and returns a cancel func.
// Double-registration for the same buddy replaces the previous connection. The
// generation counter ensures the cancel func from an older registration does not
// delete the new entry.
func (r *Registry) RegisterBuddy(id uuid.UUID, writer func(InFrame)) func() {
	r.mu.Lock()
	r.gen++
	gen := r.gen
	r.buddies[id] = buddyEntry{writer: writer, gen: gen}
	r.mu.Unlock()
	return func() {
		r.mu.Lock()
		if cur, ok := r.buddies[id]; ok && cur.gen == gen {
			delete(r.buddies, id)
		}
		r.mu.Unlock()
	}
}

// Online reports whether a buddy is currently connected.
func (r *Registry) Online(id uuid.UUID) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.buddies[id]
	return ok
}

// SendQuestion delivers a frame to a buddy. Registers a waiter for its threadId.
func (r *Registry) SendQuestion(_ context.Context, buddyID uuid.UUID, frame InFrame) error {
	r.mu.Lock()
	entry, ok := r.buddies[buddyID]
	if !ok {
		r.mu.Unlock()
		return ErrBuddyOffline
	}
	// Ensure a waiter channel exists (created by WaitForFrame). If not, create one so a reply
	// arriving before the wait starts still has somewhere to land.
	if _, ok := r.waiters[frame.ThreadID]; !ok {
		r.waiters[frame.ThreadID] = make(chan OutFrame, 4)
	}
	r.mu.Unlock()
	entry.writer(frame) // call outside lock; writer owns its own goroutine's channel
	return nil
}

// WaitForFrame blocks until an OutFrame arrives for threadID or ctx is done.
func (r *Registry) WaitForFrame(ctx context.Context, threadID uuid.UUID) (OutFrame, error) {
	r.mu.Lock()
	ch, ok := r.waiters[threadID.String()]
	if !ok {
		ch = make(chan OutFrame, 4)
		r.waiters[threadID.String()] = ch
	}
	r.mu.Unlock()

	select {
	case f := <-ch:
		return f, nil
	case <-ctx.Done():
		return OutFrame{}, ctx.Err()
	}
}

// DeliverOutFrame hands a frame to the waiting thread channel (if any) or drops it.
func (r *Registry) DeliverOutFrame(frame OutFrame) {
	r.mu.Lock()
	ch, ok := r.waiters[frame.ThreadID]
	r.mu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- frame:
	default:
		// Channel buffer full; drop — the protocol sends at most one final per turn.
	}
}

// ClearWaiter removes a waiter once a thread closes.
func (r *Registry) ClearWaiter(threadID uuid.UUID) {
	r.mu.Lock()
	delete(r.waiters, threadID.String())
	r.mu.Unlock()
}
