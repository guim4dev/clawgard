package router_test

import (
	"context"
	"testing"
	"time"

	"github.com/clawgard/clawgard/server/internal/router"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRegistryRegisterAndDispatch(t *testing.T) {
	reg := router.NewRegistry()
	buddyID := uuid.New()

	ch := make(chan router.InFrame, 1)
	cancel := reg.RegisterBuddy(buddyID, func(frame router.InFrame) {
		ch <- frame
	})
	defer cancel()

	require.True(t, reg.Online(buddyID))

	err := reg.SendQuestion(context.Background(), buddyID, router.InFrame{
		Type: "question", ThreadID: uuid.NewString(), Content: "hi", AskerEmail: "h@e.com",
	})
	require.NoError(t, err)

	select {
	case got := <-ch:
		require.Equal(t, "question", got.Type)
	case <-time.After(time.Second):
		t.Fatal("question not delivered")
	}
}

func TestSendWhenOffline(t *testing.T) {
	reg := router.NewRegistry()
	err := reg.SendQuestion(context.Background(), uuid.New(), router.InFrame{Type: "question"})
	require.ErrorIs(t, err, router.ErrBuddyOffline)
}

func TestWaitForAnswerRoutesBack(t *testing.T) {
	reg := router.NewRegistry()
	threadID := uuid.New()

	go func() {
		time.Sleep(50 * time.Millisecond)
		reg.DeliverOutFrame(router.OutFrame{
			ThreadID: threadID.String(), Type: "answer", Content: "world",
		})
	}()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	frame, err := reg.WaitForFrame(ctx, threadID)
	require.NoError(t, err)
	require.Equal(t, "answer", frame.Type)
	require.Equal(t, "world", frame.Content)
}
