package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoad_FromFileDefaultProfile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{
		"default": {"relayUrl": "https://relay.test"},
		"side":    {"relayUrl": "https://side.test"}
	}`), 0600))

	cfg, err := Load(LoadOptions{ConfigPath: path, Profile: "default"})
	require.NoError(t, err)
	require.Equal(t, "https://relay.test", cfg.RelayURL)
	require.Equal(t, "default", cfg.ProfileName)
}

func TestLoad_ProfileOverridesViaEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{
		"default": {"relayUrl": "https://default.test"},
		"work":    {"relayUrl": "https://work.test"}
	}`), 0600))

	t.Setenv("CLAWGARD_PROFILE", "work")
	cfg, err := Load(LoadOptions{ConfigPath: path})
	require.NoError(t, err)
	require.Equal(t, "https://work.test", cfg.RelayURL)
	require.Equal(t, "work", cfg.ProfileName)
}

func TestLoad_EnvOverridesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"default":{"relayUrl":"https://file.test"}}`), 0600))

	t.Setenv("CLAWGARD_URL", "https://env.test")
	cfg, err := Load(LoadOptions{ConfigPath: path, Profile: "default"})
	require.NoError(t, err)
	require.Equal(t, "https://env.test", cfg.RelayURL)
}

func TestLoad_FlagOverridesEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"default":{"relayUrl":"https://file.test"}}`), 0600))

	t.Setenv("CLAWGARD_URL", "https://env.test")
	cfg, err := Load(LoadOptions{ConfigPath: path, Profile: "default", RelayURLFlag: "https://flag.test"})
	require.NoError(t, err)
	require.Equal(t, "https://flag.test", cfg.RelayURL)
}

func TestLoad_MissingProfileIsError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"default":{"relayUrl":"https://x.test"}}`), 0600))

	_, err := Load(LoadOptions{ConfigPath: path, Profile: "nope"})
	require.ErrorContains(t, err, "profile \"nope\" not found")
}
