package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	ProfileName string
	RelayURL    string
}

type LoadOptions struct {
	ConfigPath   string // absolute path; if empty, DefaultConfigPath() is used
	Profile      string // falls back to CLAWGARD_PROFILE then "default"
	RelayURLFlag string // highest precedence
}

type fileProfile struct {
	RelayURL string `json:"relayUrl"`
}

func Load(opts LoadOptions) (Config, error) {
	profile := opts.Profile
	if profile == "" {
		profile = os.Getenv("CLAWGARD_PROFILE")
	}
	if profile == "" {
		profile = "default"
	}

	path := opts.ConfigPath
	if path == "" {
		p, err := DefaultConfigPath()
		if err != nil {
			return Config{}, err
		}
		path = p
	}

	profiles, err := readProfiles(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return Config{}, err
	}

	relay := ""
	if p, ok := profiles[profile]; ok {
		relay = p.RelayURL
	} else if len(profiles) > 0 {
		return Config{}, fmt.Errorf("profile %q not found in %s", profile, path)
	}

	if v := os.Getenv("CLAWGARD_URL"); v != "" {
		relay = v
	}
	if opts.RelayURLFlag != "" {
		relay = opts.RelayURLFlag
	}

	if relay == "" {
		return Config{}, fmt.Errorf("no relay URL configured: set --relay-url, CLAWGARD_URL, or run `clawgard-buddy setup`")
	}

	return Config{ProfileName: profile, RelayURL: relay}, nil
}

func readProfiles(path string) (map[string]fileProfile, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	out := map[string]fileProfile{}
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return out, nil
}

func DefaultConfigPath() (string, error) {
	base, err := userConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "clawgard", "config.json"), nil
}
