//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestE2E_BuddyAnswersHatchlingQuestion(t *testing.T) {
	// Plan-02 originally defaulted to ghcr.io/clawgard/clawgard-server:main, but that
	// image has not been published yet. Plan-01 builds clawgard-server:dev locally,
	// so default to that when the env var is unset. Override with
	// CLAWGARD_SERVER_IMAGE to point at a different tag/registry.
	image := os.Getenv("CLAWGARD_SERVER_IMAGE")
	if image == "" {
		t.Skip("set CLAWGARD_SERVER_IMAGE (e.g. clawgard-server:dev built by plan-01) to run e2e")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	// 1. Start server
	req := testcontainers.ContainerRequest{
		Image:        image,
		ExposedPorts: []string{"8080/tcp"},
		WaitingFor:   wait.ForHTTP("/readyz").WithPort("8080"),
		Env: map[string]string{
			"CLAWGARD_DEV_MODE":  "true", // Plan 1 provides admin bootstrap in dev mode
			"CLAWGARD_ADMIN_KEY": "test-admin-key",
		},
	}
	server, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req, Started: true,
	})
	require.NoError(t, err)
	defer server.Terminate(ctx)

	host, err := server.Host(ctx)
	require.NoError(t, err)
	port, err := server.MappedPort(ctx, "8080")
	require.NoError(t, err)
	baseURL := fmt.Sprintf("http://%s:%s", host, port.Port())

	// 2. Register a buddy via admin API, receive its API key
	buddyKey := registerBuddy(t, baseURL, "test-admin-key")

	// 3. Build clawgard-buddy binary and the echo hook
	buddyBin := buildBuddyBinary(t)
	echoHook := buildEchoHookBinary(t)

	// 4. Write config + key files
	cfgDir := t.TempDir()
	cfgPath := filepath.Join(cfgDir, "config.json")
	keyPath := filepath.Join(cfgDir, "buddy.key")
	require.NoError(t, os.WriteFile(cfgPath, []byte(fmt.Sprintf(`{"default":{"relayUrl":"%s"}}`, baseURL)), 0600))
	require.NoError(t, os.WriteFile(keyPath, []byte(buddyKey), 0600))

	// 5. Start the CLI
	env := append(os.Environ(),
		"HOME="+cfgDir, // so UserConfigDir points here on Unix
		"APPDATA="+cfgDir, // and on Windows
		"XDG_CONFIG_HOME="+cfgDir,
	)
	cliCmd := exec.CommandContext(ctx, buddyBin, "listen", "--on-question", echoHook)
	cliCmd.Env = env
	var cliErr bytes.Buffer
	cliCmd.Stderr = &cliErr
	require.NoError(t, cliCmd.Start())
	defer cliCmd.Process.Kill()

	// 6. Poll until the buddy is online
	require.Eventually(t, func() bool { return buddyOnline(t, baseURL, "test-admin-key") }, 15*time.Second, 500*time.Millisecond)

	// 7. Open a thread as a hatchling
	threadID := openThread(t, baseURL, "test-admin-key", "hello buddy")

	// 8. Poll for the answer
	require.Eventually(t, func() bool {
		return threadHasAnswer(t, baseURL, "test-admin-key", threadID, "echo:hello buddy")
	}, 15*time.Second, 500*time.Millisecond, "stderr=%s", cliErr.String())
}

func buildBuddyBinary(t *testing.T) string {
	t.Helper()
	out := filepath.Join(t.TempDir(), "clawgard-buddy")
	if os.PathSeparator == '\\' {
		out += ".exe"
	}
	cmd := exec.Command("go", "build", "-o", out, "../cmd/clawgard-buddy")
	b, err := cmd.CombinedOutput()
	require.NoError(t, err, string(b))
	return out
}

func buildEchoHookBinary(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	src := filepath.Join(dir, "echo.go")
	require.NoError(t, os.WriteFile(src, []byte(`//go:build ignore
package main
import ("encoding/json"; "os")
type in struct { Question string `+"`json:\"question\"`"+` }
func main() {
	var q in
	_ = json.NewDecoder(os.Stdin).Decode(&q)
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"type":"answer","content":"echo:"+q.Question})
}
`), 0644))
	out := filepath.Join(dir, "echo")
	if os.PathSeparator == '\\' {
		out += ".exe"
	}
	cmd := exec.Command("go", "build", "-o", out, src)
	b, err := cmd.CombinedOutput()
	require.NoError(t, err, string(b))
	return out
}

func registerBuddy(t *testing.T, base, admin string) string {
	t.Helper()
	body := strings.NewReader(`{"name":"test","description":"t","acl":{"mode":"public"}}`)
	req, _ := http.NewRequest("POST", base+"/v1/admin/buddies", body)
	req.Header.Set("Authorization", "Bearer "+admin)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, 201, resp.StatusCode)
	b, _ := io.ReadAll(resp.Body)
	var parsed struct {
		ApiKey string `json:"apiKey"`
	}
	require.NoError(t, json.Unmarshal(b, &parsed))
	return parsed.ApiKey
}

func buddyOnline(t *testing.T, base, admin string) bool {
	req, _ := http.NewRequest("GET", base+"/v1/admin/buddies", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return strings.Contains(string(b), `"online":true`)
}

func openThread(t *testing.T, base, admin, q string) string {
	t.Helper()
	// relies on Plan 1 exposing a test-mode hatchling token equal to admin key
	body := strings.NewReader(fmt.Sprintf(`{"buddyId":"__first__","question":%q}`, q))
	req, _ := http.NewRequest("POST", base+"/v1/threads", body)
	req.Header.Set("Authorization", "Bearer "+admin)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var parsed struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(b, &parsed))
	return parsed.ID
}

func threadHasAnswer(t *testing.T, base, admin, id, want string) bool {
	req, _ := http.NewRequest("GET", base+"/v1/threads/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return strings.Contains(string(b), want)
}
