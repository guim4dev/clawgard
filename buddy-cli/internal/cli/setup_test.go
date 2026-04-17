package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRunSetup_WritesConfigAndKey(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	keyPath := filepath.Join(dir, "buddy.key")

	err := RunSetup(SetupInput{
		RelayURL:   "https://relay.test",
		APIKey:     "sk-secret",
		Profile:    "default",
		ConfigPath: cfgPath,
		APIKeyPath: keyPath,
	})
	require.NoError(t, err)

	// Config file
	b, err := os.ReadFile(cfgPath)
	require.NoError(t, err)
	var parsed map[string]map[string]string
	require.NoError(t, json.Unmarshal(b, &parsed))
	require.Equal(t, "https://relay.test", parsed["default"]["relayUrl"])

	// Key file
	k, err := os.ReadFile(keyPath)
	require.NoError(t, err)
	require.Contains(t, string(k), "sk-secret")
}

func TestRunSetup_MergesProfilesWithoutLoss(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	keyPath := filepath.Join(dir, "buddy.key")
	require.NoError(t, os.WriteFile(cfgPath, []byte(`{"existing":{"relayUrl":"https://old.test"}}`), 0600))

	require.NoError(t, RunSetup(SetupInput{
		RelayURL:   "https://new.test",
		APIKey:     "sk-new",
		Profile:    "default",
		ConfigPath: cfgPath,
		APIKeyPath: keyPath,
	}))

	b, err := os.ReadFile(cfgPath)
	require.NoError(t, err)
	var parsed map[string]map[string]string
	require.NoError(t, json.Unmarshal(b, &parsed))
	require.Equal(t, "https://old.test", parsed["existing"]["relayUrl"])
	require.Equal(t, "https://new.test", parsed["default"]["relayUrl"])
}
