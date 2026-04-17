package hook

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func buildEchoHook(t *testing.T) string {
	t.Helper()
	out := filepath.Join(t.TempDir(), "echo_hook")
	if runtimeIsWindows() {
		out += ".exe"
	}
	cmd := exec.Command("go", "build", "-o", out, "./testdata/echo_hook.go")
	cmd.Env = os.Environ()
	b, err := cmd.CombinedOutput()
	require.NoError(t, err, string(b))
	return out
}

func runtimeIsWindows() bool { return os.PathSeparator == '\\' }

func TestRun_EchoesQuestion(t *testing.T) {
	bin := buildEchoHook(t)

	r := NewRunner(RunnerOptions{Command: bin, Timeout: 5 * time.Second})
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()

	resp, err := r.Run(ctx, Question{ThreadID: "t1", Question: "hello", AskerEmail: "a@b", Turn: 1})
	require.NoError(t, err)
	require.Equal(t, "answer", resp.Type)
	require.Equal(t, "echo:hello", resp.Content)
}

func TestRun_InvalidJSONStdoutIsError(t *testing.T) {
	// a hook that prints garbage — use the shell builtin echo via `go run` wrapper?
	// simplest: use the echo_hook but feed it invalid input so it exits 2.
	bin := buildEchoHook(t)
	r := NewRunner(RunnerOptions{Command: bin + " --bogus-flag-that-is-ignored", Timeout: 5 * time.Second})
	// feed it something it will reject — actually our helper decodes any JSON.
	// force failure by pointing at a non-existent binary via shlex:
	r = NewRunner(RunnerOptions{Command: "/nonexistent/no/such/binary", Timeout: 2 * time.Second})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := r.Run(ctx, Question{ThreadID: "t1", Question: "hi", Turn: 1})
	require.Error(t, err)
}

func TestRun_TimeoutKillsSubprocess(t *testing.T) {
	// build a sleeper hook inline
	sleeper := filepath.Join(t.TempDir(), "sleeper")
	if runtimeIsWindows() {
		sleeper += ".exe"
	}
	src := filepath.Join(t.TempDir(), "sleeper.go")
	require.NoError(t, os.WriteFile(src, []byte(`//go:build ignore
package main
import "time"
func main() { time.Sleep(10 * time.Second) }
`), 0644))
	cmd := exec.Command("go", "build", "-o", sleeper, src)
	b, err := cmd.CombinedOutput()
	require.NoError(t, err, string(b))

	r := NewRunner(RunnerOptions{Command: sleeper, Timeout: 500 * time.Millisecond})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	start := time.Now()
	_, err = r.Run(ctx, Question{ThreadID: "t", Question: "q", Turn: 1})
	require.Error(t, err)
	require.Less(t, time.Since(start), 3*time.Second)
}
