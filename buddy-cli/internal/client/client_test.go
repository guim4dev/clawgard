package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/require"
)

func TestClient_Connect_SendsBearerHeader(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		c.Close(websocket.StatusNormalClosure, "")
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/buddy/connect"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	c := New(Options{RelayURL: wsURL, APIKey: "sk-test"})
	conn, err := c.Dial(ctx)
	require.NoError(t, err)
	_ = conn.Close(websocket.StatusNormalClosure, "bye")

	require.Equal(t, "Bearer sk-test", gotAuth)
}

func TestClient_ReadLoop_DispatchesQuestions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		_ = c.Write(r.Context(), websocket.MessageText,
			[]byte(`{"type":"question","threadId":"11111111-1111-1111-1111-111111111111","content":"hi","askerEmail":"a@b.c"}`))
		// keep open briefly
		time.Sleep(100 * time.Millisecond)
		c.Close(websocket.StatusNormalClosure, "")
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/buddy/connect"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	got := make(chan InFrame, 1)
	c := New(Options{RelayURL: wsURL, APIKey: "k"})
	conn, err := c.Dial(ctx)
	require.NoError(t, err)

	session := NewSession(conn)
	go session.Run(ctx, func(f InFrame) { got <- f })

	select {
	case f := <-got:
		require.Equal(t, "question", f.Type)
		require.Equal(t, "hi", f.Content)
	case <-ctx.Done():
		t.Fatal("no frame received")
	}
}

func TestSession_Send_SerializesConcurrentWrites(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, _ := websocket.Accept(w, r, nil)
		for i := 0; i < 10; i++ {
			_, _, err := c.Read(r.Context())
			if err != nil {
				return
			}
		}
		c.Close(websocket.StatusNormalClosure, "")
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/v1/buddy/connect"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	c := New(Options{RelayURL: wsURL, APIKey: "k"})
	conn, err := c.Dial(ctx)
	require.NoError(t, err)

	session := NewSession(conn)
	// fire 10 writes concurrently; Session must not panic or corrupt frames
	done := make(chan struct{}, 10)
	for i := 0; i < 10; i++ {
		go func(i int) {
			_ = session.Send(ctx, OutFrame{Type: "answer", ThreadID: "t", Content: "c"})
			done <- struct{}{}
		}(i)
	}
	for i := 0; i < 10; i++ {
		<-done
	}
}
