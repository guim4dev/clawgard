package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/clawgard/clawgard/server/internal/auth"
	"github.com/clawgard/clawgard/server/internal/router"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// MountBuddyWS mounts GET /v1/buddy/connect on the router.
func MountBuddyWS(r chi.Router, s *store.Store, reg *router.Registry) {
	r.Get("/v1/buddy/connect", handleBuddyConnect(s, reg))
}

func handleBuddyConnect(s *store.Store, reg *router.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		if !strings.HasPrefix(authz, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "unauthorized", "missing api key")
			return
		}
		rawKey := strings.TrimPrefix(authz, "Bearer ")

		buddy, err := lookupBuddyByAPIKey(r.Context(), s, rawKey)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid api key")
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true, // handshake is same-origin; TLS handled by the reverse proxy.
		})
		if err != nil {
			return
		}

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// Write loop runs on its own goroutine; registered writer pushes frames into a channel.
		writeCh := make(chan router.InFrame, 16)
		unregister := reg.RegisterBuddy(buddy.ID, func(f router.InFrame) {
			select {
			case writeCh <- f:
			default:
				// buffer full; drop and log (logging omitted for brevity)
			}
		})
		defer unregister()

		// Update last_seen on connect.
		_ = s.Buddies().TouchLastSeen(ctx, buddy.ID)

		// Writer goroutine.
		writerDone := make(chan struct{})
		go func() {
			defer close(writerDone)
			pingTicker := time.NewTicker(30 * time.Second)
			defer pingTicker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-pingTicker.C:
					pctx, pcancel := context.WithTimeout(ctx, 10*time.Second)
					err := conn.Ping(pctx)
					pcancel()
					if err != nil {
						return
					}
				case frame := <-writeCh:
					body, _ := json.Marshal(frame)
					wctx, wcancel := context.WithTimeout(ctx, 10*time.Second)
					err := conn.Write(wctx, websocket.MessageText, body)
					wcancel()
					if err != nil {
						return
					}
				}
			}
		}()

		// Read loop.
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				break
			}
			var out router.OutFrame
			if err := json.Unmarshal(data, &out); err != nil {
				continue
			}
			reg.DeliverOutFrame(out)
			_ = s.Buddies().TouchLastSeen(ctx, buddy.ID)
		}

		cancel()
		_ = conn.Close(websocket.StatusNormalClosure, "bye")
		<-writerDone
	}
}

// lookupBuddyByAPIKey compares the raw key against every non-deleted buddy's hash.
// For MVP scale (tens of buddies) this is fine; revisit for >1000 buddies.
func lookupBuddyByAPIKey(ctx context.Context, s *store.Store, raw string) (store.Buddy, error) {
	buddies, err := s.Buddies().ListAll(ctx)
	if err != nil {
		return store.Buddy{}, err
	}
	for _, b := range buddies {
		if err := auth.VerifyAPIKey(b.APIKeyHash, raw); err == nil {
			return b, nil
		}
	}
	_ = uuid.Nil
	return store.Buddy{}, errors.New("no matching buddy")
}
