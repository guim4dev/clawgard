package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/clawgard/clawgard/server/internal/api"
	"github.com/clawgard/clawgard/server/internal/router"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func setupTestHatchlingServer(t *testing.T) (*httptest.Server, *store.Store, *router.Registry, store.Buddy) {
	t.Helper()
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()
	s, _ := store.Open(ctx, dsn)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(ctx, s.Pool()))

	buddy, _ := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "jean", OwnerEmail: "o@e.com", APIKeyHash: "h", ACL: store.ACL{Mode: "public"},
	})
	reg := router.NewRegistry()

	r := chi.NewRouter()
	r.Use(func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			req = req.WithContext(api.WithIdentity(req.Context(),
				api.Identity{Email: "hatch@e.com"}))
			h.ServeHTTP(w, req)
		})
	})
	api.MountHatchling(r, s, reg)

	return httptest.NewServer(r), s, reg, buddy
}

func TestHatchlingListBuddiesRespectsACL(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	ts, s, _, _ := setupTestHatchlingServer(t)
	defer ts.Close()

	_, _ = s.Buddies().Create(context.Background(), store.NewBuddy{
		Name: "secret", OwnerEmail: "o@e.com", APIKeyHash: "h",
		ACL: store.ACL{Mode: "users", Users: []string{"nobody@e.com"}},
	})

	resp, err := http.Get(ts.URL + "/v1/buddies")
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var list []map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&list))
	require.Len(t, list, 1)
	require.Equal(t, "jean", list[0]["name"])
}

func TestHatchlingOpenThreadRoutesQuestion(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	ts, _, reg, buddy := setupTestHatchlingServer(t)
	defer ts.Close()

	received := make(chan router.InFrame, 1)
	cancel := reg.RegisterBuddy(buddy.ID, func(f router.InFrame) { received <- f })
	defer cancel()

	body, _ := json.Marshal(map[string]any{
		"buddyId":  buddy.ID.String(),
		"question": "what does WAC stand for?",
	})
	resp, err := http.Post(ts.URL+"/v1/threads", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	select {
	case frame := <-received:
		require.Equal(t, "question", frame.Type)
		require.Equal(t, "what does WAC stand for?", frame.Content)
		require.Equal(t, "hatch@e.com", frame.AskerEmail)
	case <-time.After(2 * time.Second):
		t.Fatal("buddy never received the question")
	}
}

func TestHatchlingClarificationTurnCap(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	ts, s, reg, buddy := setupTestHatchlingServer(t)
	defer ts.Close()

	cancel := reg.RegisterBuddy(buddy.ID, func(router.InFrame) {})
	defer cancel()

	body, _ := json.Marshal(map[string]any{"buddyId": buddy.ID.String(), "question": "q"})
	resp, _ := http.Post(ts.URL+"/v1/threads", "application/json", bytes.NewReader(body))
	var th map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&th)
	resp.Body.Close()
	threadID := th["id"].(string)

	// Bump turns to 3 directly (first turn already counted on open).
	for i := 0; i < 2; i++ {
		body, _ := json.Marshal(map[string]any{"content": "clar"})
		r2, _ := http.Post(ts.URL+"/v1/threads/"+threadID+"/messages", "application/json", bytes.NewReader(body))
		r2.Body.Close()
	}

	// Fourth attempt must be rejected.
	body, _ = json.Marshal(map[string]any{"content": "over"})
	rej, err := http.Post(ts.URL+"/v1/threads/"+threadID+"/messages", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	defer rej.Body.Close()
	require.Equal(t, http.StatusConflict, rej.StatusCode)

	_ = s // silence lint
}

func TestEndToEndAskAndAnswerRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	ts, s, reg, buddy := setupTestHatchlingServer(t)
	defer ts.Close()

	// Simulate a buddy that answers "pong".
	cancel := reg.RegisterBuddy(buddy.ID, func(in router.InFrame) {
		go func() {
			time.Sleep(50 * time.Millisecond)
			reg.DeliverOutFrame(router.OutFrame{
				Type: "answer", ThreadID: in.ThreadID, Content: "pong",
			})
			// AND: post the message to the store as if buddy_ws did it.
			_, _ = s.Messages().Append(context.Background(), store.NewMessage{
				ThreadID: uuid.MustParse(in.ThreadID), Role: "buddy", Type: "answer", Content: "pong",
			})
			_ = s.Threads().Close(context.Background(), uuid.MustParse(in.ThreadID), "answered")
		}()
	})
	defer cancel()

	// Open the thread.
	body, _ := json.Marshal(map[string]any{"buddyId": buddy.ID.String(), "question": "ping"})
	resp, err := http.Post(ts.URL+"/v1/threads", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	var th map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&th)
	resp.Body.Close()
	threadID := th["id"].(string)

	// Long-poll.
	time.Sleep(150 * time.Millisecond)
	r2, err := http.Get(ts.URL + "/v1/threads/" + threadID + "?waitSeconds=2")
	require.NoError(t, err)
	defer r2.Body.Close()
	require.Equal(t, http.StatusOK, r2.StatusCode)
	var full map[string]any
	require.NoError(t, json.NewDecoder(r2.Body).Decode(&full))
	require.Equal(t, "closed", full["status"])
	msgs := full["messages"].([]any)
	require.Len(t, msgs, 2)
}
