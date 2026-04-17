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

	// Admin endpoints: AdminMiddleware handles dev-mode admin key OR real OIDC.
	r.Group(func(r chi.Router) {
		r.Use(api.AdminMiddleware(oidcVerifier, cfg.DevAdminKey, []string{}))
		api.MountAdmin(r, s)
	})

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
