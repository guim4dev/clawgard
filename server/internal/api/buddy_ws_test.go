package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/clawgard/clawgard/server/internal/api"
	"github.com/clawgard/clawgard/server/internal/auth"
	"github.com/clawgard/clawgard/server/internal/router"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBuddyConnectAcceptsAndEchoesOneRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()
	s, _ := store.Open(ctx, dsn)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(ctx, s.Pool()))

	key, _ := auth.GenerateAPIKey()
	hash, _ := auth.HashAPIKey(key)
	b, _ := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "echo", OwnerEmail: "o@e.com", APIKeyHash: hash, ACL: store.ACL{Mode: "public"},
	})

	reg := router.NewRegistry()
	r := chi.NewRouter()
	api.MountBuddyWS(r, s, reg)

	ts := httptest.NewServer(r)
	defer ts.Close()

	u, _ := url.Parse(ts.URL)
	u.Scheme = "ws"
	u.Path = "/v1/buddy/connect"

	conn, resp, err := websocket.Dial(ctx, u.String(), &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": []string{"Bearer " + key}},
	})
	require.NoError(t, err)
	defer conn.CloseNow()
	require.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)

	// Give the server a moment to register.
	time.Sleep(50 * time.Millisecond)
	require.True(t, reg.Online(b.ID))

	// Inject a question via the registry; expect the buddy to receive it.
	threadID := uuid.New()
	require.NoError(t, reg.SendQuestion(ctx, b.ID, router.InFrame{
		Type: "question", ThreadID: threadID.String(), Content: "ping", AskerEmail: "h@e.com",
	}))

	_, raw, err := conn.Read(ctx)
	require.NoError(t, err)
	var in router.InFrame
	require.NoError(t, json.Unmarshal(raw, &in))
	require.Equal(t, "question", in.Type)
	require.Equal(t, "ping", in.Content)

	// Reply with an answer.
	reply, _ := json.Marshal(router.OutFrame{
		Type: "answer", ThreadID: threadID.String(), Content: "pong",
	})
	require.NoError(t, conn.Write(ctx, websocket.MessageText, reply))

	// The registry should receive it.
	waitCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	out, err := reg.WaitForFrame(waitCtx, threadID)
	require.NoError(t, err)
	require.Equal(t, "pong", out.Content)

	_ = strings.NewReader("") // keep unused import alive if logs removed
}

func TestBuddyConnectRejectsInvalidKey(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()
	s, _ := store.Open(ctx, dsn)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(ctx, s.Pool()))

	reg := router.NewRegistry()
	r := chi.NewRouter()
	api.MountBuddyWS(r, s, reg)

	ts := httptest.NewServer(r)
	defer ts.Close()

	u, _ := url.Parse(ts.URL)
	u.Scheme = "ws"
	u.Path = "/v1/buddy/connect"

	_, resp, err := websocket.Dial(ctx, u.String(), &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": []string{"Bearer not-a-key"}},
	})
	require.Error(t, err)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
