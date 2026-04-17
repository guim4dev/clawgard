package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config is the runtime configuration for clawgard-server.
type Config struct {
	HTTPAddr          string
	DatabaseURL       string
	OIDCIssuer        string
	OIDCAudience      string
	ThreadIdleSeconds int
	SweeperInterval   time.Duration
	DevMode           bool
	DevAdminKey       string
	LogLevel          string
}

type fileSchema map[string]struct {
	HTTPAddr string `json:"httpAddr"`
	Database struct {
		URL string `json:"url"`
	} `json:"database"`
	OIDC struct {
		Issuer   string `json:"issuer"`
		Audience string `json:"audience"`
	} `json:"oidc"`
	ThreadIdleSeconds int    `json:"threadIdleSeconds"`
	LogLevel          string `json:"logLevel"`
}

// Load reads the config file at the given path (if non-empty) and overlays env vars.
// Precedence: env vars > file > defaults.
func Load(path string) (Config, error) {
	cfg := Config{
		HTTPAddr:          ":8080",
		ThreadIdleSeconds: 15 * 60,
		SweeperInterval:   15 * time.Second,
		LogLevel:          "info",
	}

	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return cfg, fmt.Errorf("read config file %q: %w", path, err)
		}
		var parsed fileSchema
		if err := json.Unmarshal(data, &parsed); err != nil {
			return cfg, fmt.Errorf("parse config file: %w", err)
		}
		profile := envOr("CLAWGARD_PROFILE", "default")
		section, ok := parsed[profile]
		if !ok {
			return cfg, fmt.Errorf("profile %q not found in config", profile)
		}
		if section.HTTPAddr != "" {
			cfg.HTTPAddr = section.HTTPAddr
		}
		cfg.DatabaseURL = section.Database.URL
		cfg.OIDCIssuer = section.OIDC.Issuer
		cfg.OIDCAudience = section.OIDC.Audience
		if section.ThreadIdleSeconds > 0 {
			cfg.ThreadIdleSeconds = section.ThreadIdleSeconds
		}
		if section.LogLevel != "" {
			cfg.LogLevel = section.LogLevel
		}
	}

	if v := os.Getenv("CLAWGARD_HTTP_ADDR"); v != "" {
		cfg.HTTPAddr = v
	}
	if v := os.Getenv("CLAWGARD_DATABASE_URL"); v != "" {
		cfg.DatabaseURL = v
	}
	if v := os.Getenv("CLAWGARD_OIDC_ISSUER"); v != "" {
		cfg.OIDCIssuer = v
	}
	if v := os.Getenv("CLAWGARD_OIDC_AUDIENCE"); v != "" {
		cfg.OIDCAudience = v
	}
	if v := os.Getenv("CLAWGARD_LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("CLAWGARD_THREAD_IDLE_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.ThreadIdleSeconds = n
		}
	}
	if os.Getenv("CLAWGARD_DEV_MODE") == "true" {
		cfg.DevMode = true
		cfg.DevAdminKey = os.Getenv("CLAWGARD_ADMIN_KEY")
	}

	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
