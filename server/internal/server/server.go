package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/clawgard/clawgard/server/internal/api"
	"github.com/clawgard/clawgard/server/internal/auth"
	"github.com/clawgard/clawgard/server/internal/config"
	"github.com/clawgard/clawgard/server/internal/router"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/sweeper"
	"github.com/clawgard/clawgard/server/internal/web"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Server struct {
	cfg   config.Config
	store *store.Store
	reg   *router.Registry
	sw    *sweeper.Sweeper
	lis   net.Listener
	srv   *http.Server
	log   *slog.Logger
}

func New(ctx context.Context, cfg config.Config) (*Server, error) {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(cfg.LogLevel)}))

	s, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open store: %w", err)
	}
	if err := store.Migrate(ctx, s.Pool()); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	var oidcVerifier *auth.OIDCVerifier
	if cfg.OIDCIssuer != "" {
		v, err := auth.NewOIDCVerifier(ctx, auth.OIDCConfig{Issuer: cfg.OIDCIssuer, Audience: cfg.OIDCAudience})
		if err != nil {
			log.Warn("oidc verifier init failed; admin endpoints will only accept dev admin key",
				"err", err)
		} else {
			oidcVerifier = v
		}
	}

	reg := router.NewRegistry()
	sw := sweeper.New(s, cfg.SweeperInterval, time.Duration(cfg.ThreadIdleSeconds)*time.Second)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	live, ready := api.HealthHandlers(s.Pool())
	r.Get("/healthz", live)
	r.Get("/readyz", ready)

	// Device-code endpoints: no auth required.
	api.MountDeviceCode(r, s, "http://localhost/device") // Plan 5 replaces this URL.

	// Buddy WebSocket: its handler does its own bearer-key auth.
	api.MountBuddyWS(r, s, reg)

	// Hatchling endpoints require OIDC middleware when configured.
	r.Group(func(r chi.Router) {
		r.Use(api.HatchlingOIDCMiddleware(oidcVerifier))
		api.MountHatchling(r, s, reg)
	})

	// Build the session signer + admin-email set up front when configured so
	// the admin middleware can accept dashboard session cookies in addition to
	// the existing bearer/dev-key paths used by buddy-cli and OIDC.
	var sessionSigner *api.SessionSigner
	adminEmailSet := make(map[string]bool, len(cfg.AdminEmails))
	for _, e := range cfg.AdminEmails {
		adminEmailSet[e] = true
	}
	if cfg.SessionSecret != "" {
		sessionSigner = api.NewSessionSigner([]byte(cfg.SessionSecret))
	}

	// Admin endpoints: AdminMiddleware handles dev-mode admin key OR real OIDC,
	// plus dashboard session cookies when a SessionSecret is configured.
	r.Group(func(r chi.Router) {
		r.Use(api.AdminMiddlewareWithSession(oidcVerifier, cfg.DevAdminKey, []string{}, sessionSigner, adminEmailSet))
		api.MountAdmin(r, s)
	})

	// Plan 5 dashboard: session-cookie auth, /v1/me, /auth/{login,callback,logout},
	// and the embedded SPA catch-all. All three require a SessionSecret; if the
	// operator hasn't configured one, we skip the SPA surface entirely (the
	// bare API still works for buddy-cli and hatchling-skill flows).
	if sessionSigner != nil {
		signer := sessionSigner
		meHandler := api.NewMeHandler(api.MeConfig{
			Signer:      signer,
			AdminEmails: adminEmailSet,
			BuddyStore:  &buddyOwnerLookup{store: s},
		})
		r.Method(http.MethodGet, "/v1/me", meHandler)

		// Build an AuthHandler whenever we have a signer; it's needed for both
		// real OIDC and the dev-only mock login. Logout always works because it
		// just clears the cookie.
		authHandler := api.NewAuthHandler(api.AuthConfig{
			IdPAuthURL:   cfg.OIDCAuthURL,
			IdPTokenURL:  cfg.OIDCTokenURL,
			ClientID:     cfg.OIDCClientID,
			ClientSecret: cfg.OIDCClientSecret,
			RedirectURL:  cfg.OIDCRedirectURL,
			Signer:       signer,
			StateStore:   api.NewMemoryStateStore(),
			Dev:          cfg.DevMode,
		})
		r.Post("/auth/logout", authHandler.Logout)
		switch {
		case cfg.IdPMode == "mock" && cfg.DevMode:
			// Mock IdP: used by Playwright E2E. Accepts ?email=&redirect=.
			r.Get("/auth/login", authHandler.MockLogin)
		case cfg.OIDCClientID != "" && cfg.OIDCTokenURL != "":
			r.Get("/auth/login", authHandler.Login)
			r.Get("/auth/callback", authHandler.Callback)
		}

		// SPA fallback must come last. The handler itself rejects /v1/* and
		// /auth/* paths defensively, but chi's routing ensures those mounts
		// win by virtue of being registered first.
		spa := web.Handler()
		r.NotFound(spa.ServeHTTP)
		r.MethodNotAllowed(spa.ServeHTTP)
	}

	lis, err := net.Listen("tcp", cfg.HTTPAddr)
	if err != nil {
		return nil, err
	}

	return &Server{
		cfg:   cfg,
		store: s,
		reg:   reg,
		sw:    sw,
		lis:   lis,
		log:   log,
		srv: &http.Server{
			Handler:           r,
			ReadHeaderTimeout: 10 * time.Second,
		},
	}, nil
}

// Addr returns the bound address.
func (s *Server) Addr() string {
	if s.lis == nil {
		return ""
	}
	return s.lis.Addr().String()
}

// Run serves until ctx is done.
func (s *Server) Run(ctx context.Context) error {
	go s.sw.Run(ctx)

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.srv.Shutdown(shutdownCtx)
		s.store.Close()
	}()

	s.log.Info("clawgard-server listening", "addr", s.lis.Addr().String())
	if err := s.srv.Serve(s.lis); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// buddyOwnerLookup adapts *store.Store to api.BuddyOwnerLookup. It answers
// "does this email own any non-deleted buddy?" by scanning the admin list.
// The admin list is small (O(buddies)) and the query is rare (once per page
// load when /v1/me is called), so an in-memory scan is acceptable for MVP.
type buddyOwnerLookup struct {
	store *store.Store
}

func (b *buddyOwnerLookup) HasBuddiesOwnedBy(email string) (bool, error) {
	bs, err := b.store.Buddies().ListAll(context.Background())
	if err != nil {
		return false, err
	}
	for _, bd := range bs {
		if bd.OwnerEmail == email {
			return true, nil
		}
	}
	return false, nil
}

func parseLevel(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
