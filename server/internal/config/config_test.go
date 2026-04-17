package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/clawgard/clawgard/server/internal/config"
	"github.com/stretchr/testify/require"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("CLAWGARD_CONFIG", "")
	cfg, err := config.Load("")
	require.NoError(t, err)
	require.Equal(t, ":8080", cfg.HTTPAddr)
	require.Equal(t, 15*60, cfg.ThreadIdleSeconds) // 15 minutes default
	require.False(t, cfg.DevMode)
}

func TestLoadFromFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{
		"default": {
			"httpAddr": "127.0.0.1:9090",
			"database": { "url": "postgres://u:p@localhost/clawgard" },
			"oidc":     { "issuer": "https://issuer.example", "audience": "clawgard" }
		}
	}`), 0o600))

	cfg, err := config.Load(path)
	require.NoError(t, err)
	require.Equal(t, "127.0.0.1:9090", cfg.HTTPAddr)
	require.Equal(t, "postgres://u:p@localhost/clawgard", cfg.DatabaseURL)
}

func TestEnvOverridesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{
		"default": { "httpAddr": ":8080" }
	}`), 0o600))

	t.Setenv("CLAWGARD_HTTP_ADDR", "127.0.0.1:7777")
	cfg, err := config.Load(path)
	require.NoError(t, err)
	require.Equal(t, "127.0.0.1:7777", cfg.HTTPAddr)
}

func TestDevModeFromEnv(t *testing.T) {
	t.Setenv("CLAWGARD_DEV_MODE", "true")
	t.Setenv("CLAWGARD_ADMIN_KEY", "abc123")
	cfg, err := config.Load("")
	require.NoError(t, err)
	require.True(t, cfg.DevMode)
	require.Equal(t, "abc123", cfg.DevAdminKey)
}

func TestProfileSelection(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{
		"default":  { "httpAddr": ":8080" },
		"staging":  { "httpAddr": ":9090" }
	}`), 0o600))

	t.Setenv("CLAWGARD_PROFILE", "staging")
	cfg, err := config.Load(path)
	require.NoError(t, err)
	require.Equal(t, ":9090", cfg.HTTPAddr)
}
