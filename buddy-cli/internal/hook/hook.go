package hook

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"time"

	"github.com/google/shlex"
)

type Question struct {
	ThreadID   string `json:"threadId"`
	Question   string `json:"question"`
	AskerEmail string `json:"askerEmail"`
	Turn       int    `json:"turn"`
}

type Response struct {
	Type    string `json:"type"`    // "answer" | "clarification_request" | "close"
	Content string `json:"content"`
}

type RunnerOptions struct {
	Command string        // full command, shlex-split
	Timeout time.Duration // per-invocation wall clock
}

type Runner struct{ opts RunnerOptions }

func NewRunner(opts RunnerOptions) *Runner {
	if opts.Timeout == 0 {
		opts.Timeout = 120 * time.Second
	}
	return &Runner{opts: opts}
}

var ErrInvalidResponse = errors.New("hook produced no valid JSON response")

func (r *Runner) Run(ctx context.Context, q Question) (Response, error) {
	argv, err := shlex.Split(r.opts.Command)
	if err != nil || len(argv) == 0 {
		return Response{}, fmt.Errorf("invalid hook command %q: %w", r.opts.Command, err)
	}

	ctx, cancel := context.WithTimeout(ctx, r.opts.Timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)

	in, err := json.Marshal(q)
	if err != nil {
		return Response{}, err
	}
	cmd.Stdin = bytes.NewReader(in)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return Response{}, fmt.Errorf("hook timed out after %s", r.opts.Timeout)
		}
		return Response{}, fmt.Errorf("hook failed: %w: %s", err, stderr.String())
	}

	var resp Response
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &resp); err != nil {
		return Response{}, fmt.Errorf("%w: %v; stdout=%q", ErrInvalidResponse, err, stdout.String())
	}
	if resp.Type == "" {
		return Response{}, ErrInvalidResponse
	}
	return resp, nil
}
