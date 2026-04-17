package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
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

	// Plan 5 (dashboard) additions.
	// OIDC PKCE flow for browser logins:
	OIDCAuthURL      string
	OIDCTokenURL     string
	OIDCClientID     string
	OIDCClientSecret string
	OIDCRedirectURL  string
	// Session cookie signing secret (must be >= 32 bytes when set).
	SessionSecret string
	// Comma-separated admin emails (CLAWGARD_ADMIN_EMAILS) for the /v1/me role derivation.
	AdminEmails []string
	// PublicURL is the externally visible server origin (used for OIDC redirect defaults).
	PublicURL string
	// IdPMode selects the browser login flow. "" or "oidc" = real PKCE exchange,
	// "mock" = dev-only mock login that accepts any email via query param. Must
	// only be used when DevMode is true; main.go enforces this.
	IdPMode string
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
	if v := os.Getenv("CLAWGARD_PORT"); v != "" {
		cfg.HTTPAddr = ":" + v
	}
	if v := os.Getenv("CLAWGARD_DATABASE_URL"); v != "" {
		cfg.DatabaseURL = v
	}
	if v := os.Getenv("CLAWGARD_DB_URL"); v != "" {
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

	// Plan 5 env overlays.
	if v := os.Getenv("CLAWGARD_OIDC_AUTH_URL"); v != "" {
		cfg.OIDCAuthURL = v
	}
	if v := os.Getenv("CLAWGARD_OIDC_TOKEN_URL"); v != "" {
		cfg.OIDCTokenURL = v
	}
	if v := os.Getenv("CLAWGARD_OIDC_CLIENT_ID"); v != "" {
		cfg.OIDCClientID = v
	}
	if v := os.Getenv("CLAWGARD_OIDC_CLIENT_SECRET"); v != "" {
		cfg.OIDCClientSecret = v
	}
	if v := os.Getenv("CLAWGARD_OIDC_REDIRECT_URL"); v != "" {
		cfg.OIDCRedirectURL = v
	}
	if v := os.Getenv("CLAWGARD_SESSION_SECRET"); v != "" {
		cfg.SessionSecret = v
	}
	if v := os.Getenv("CLAWGARD_ADMIN_EMAILS"); v != "" {
		for _, e := range strings.Split(v, ",") {
			if e = strings.TrimSpace(e); e != "" {
				cfg.AdminEmails = append(cfg.AdminEmails, e)
			}
		}
	}
	if v := os.Getenv("CLAWGARD_PUBLIC_URL"); v != "" {
		cfg.PublicURL = v
	}
	if v := os.Getenv("CLAWGARD_IDP_MODE"); v != "" {
		cfg.IdPMode = v
	}
	if os.Getenv("CLAWGARD_ENV") == "dev" {
		cfg.DevMode = true
	}

	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
