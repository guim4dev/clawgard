package client

import (
	"math/rand"
	"time"
)

type BackoffConfig struct {
	Initial time.Duration
	Max     time.Duration
	Jitter  float64 // 0.2 = ±20%
	Rand    *rand.Rand
}

type Backoff struct {
	cfg     BackoffConfig
	current time.Duration
	rng     *rand.Rand
}

func NewBackoff(cfg BackoffConfig) *Backoff {
	if cfg.Initial <= 0 {
		cfg.Initial = 1 * time.Second
	}
	if cfg.Max <= 0 {
		cfg.Max = 30 * time.Second
	}
	rng := cfg.Rand
	if rng == nil {
		rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	}
	return &Backoff{cfg: cfg, rng: rng}
}

func (b *Backoff) Next() time.Duration {
	if b.current == 0 {
		b.current = b.cfg.Initial
	} else {
		b.current *= 2
		if b.current > b.cfg.Max {
			b.current = b.cfg.Max
		}
	}
	return b.applyJitter(b.current)
}

func (b *Backoff) Reset() { b.current = 0 }

func (b *Backoff) applyJitter(d time.Duration) time.Duration {
	if b.cfg.Jitter <= 0 {
		return d
	}
	span := float64(d) * b.cfg.Jitter
	offset := (b.rng.Float64()*2 - 1) * span
	return time.Duration(float64(d) + offset)
}
