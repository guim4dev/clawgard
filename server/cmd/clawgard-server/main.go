package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/clawgard/clawgard/server/internal/config"
	"github.com/clawgard/clawgard/server/internal/server"
	"github.com/clawgard/clawgard/server/internal/store"
)

var version = "dev"

func run(args []string) (string, error) {
	if len(args) < 2 {
		return usage(), nil
	}
	switch args[1] {
	case "serve":
		cfg, err := config.Load(os.Getenv("CLAWGARD_CONFIG"))
		if err != nil {
			return "", err
		}
		ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer cancel()
		srv, err := server.New(ctx, cfg)
		if err != nil {
			return "", err
		}
		if err := srv.Run(ctx); err != nil {
			return "", err
		}
		return "server shut down cleanly", nil
	case "migrate":
		cfg, err := config.Load(os.Getenv("CLAWGARD_CONFIG"))
		if err != nil {
			return "", err
		}
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		s, err := store.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			return "", err
		}
		defer s.Close()
		if err := store.Migrate(ctx, s.Pool()); err != nil {
			return "", err
		}
		return "migrations applied", nil
	case "version":
		return version, nil
	default:
		return usage(), fmt.Errorf("unknown subcommand %q", args[1])
	}
}

func usage() string {
	return `usage:
  clawgard-server serve     Start the relay server
  clawgard-server migrate   Apply database migrations and exit
  clawgard-server version   Print version`
}

func main() {
	out, err := run(os.Args)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(out)
}
