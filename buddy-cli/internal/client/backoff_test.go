package client

import (
	"math/rand"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestBackoff_Sequence(t *testing.T) {
	b := NewBackoff(BackoffConfig{
		Initial: 1 * time.Second,
		Max:     30 * time.Second,
		Jitter:  0, // disable jitter for deterministic check
		Rand:    rand.New(rand.NewSource(1)),
	})
	want := []time.Duration{1 * time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 30 * time.Second, 30 * time.Second}
	for i, w := range want {
		got := b.Next()
		require.Equalf(t, w, got, "attempt %d", i)
	}
}

func TestBackoff_JitterWithinBand(t *testing.T) {
	b := NewBackoff(BackoffConfig{
		Initial: 1 * time.Second,
		Max:     30 * time.Second,
		Jitter:  0.2,
		Rand:    rand.New(rand.NewSource(42)),
	})
	for i := 0; i < 20; i++ {
		b.Next() // walk to saturation
	}
	for i := 0; i < 100; i++ {
		d := b.Next()
		require.GreaterOrEqual(t, d, 24*time.Second, "lower bound (Max*0.8)")
		require.LessOrEqual(t, d, 36*time.Second, "upper bound (Max*1.2)")
	}
}

func TestBackoff_ResetAfterSuccess(t *testing.T) {
	b := NewBackoff(BackoffConfig{Initial: 1 * time.Second, Max: 30 * time.Second})
	b.Next()
	b.Next()
	b.Reset()
	require.Equal(t, 1*time.Second, b.Next())
}
