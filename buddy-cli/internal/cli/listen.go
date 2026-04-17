package cli

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/clawgard/clawgard/buddy-cli/internal/auth"
	"github.com/clawgard/clawgard/buddy-cli/internal/client"
	"github.com/clawgard/clawgard/buddy-cli/internal/config"
	"github.com/clawgard/clawgard/buddy-cli/internal/hook"
)

type listenFlags struct {
	onQuestion      string
	profile         string
	relayURL        string
	questionTimeout time.Duration
	dryRun          bool
}

func newListenCmd() *cobra.Command {
	f := listenFlags{}
	cmd := &cobra.Command{
		Use:   "listen",
		Short: "Connect to the relay and dispatch questions to a subprocess hook",
		RunE: func(cmd *cobra.Command, args []string) error {
			if f.onQuestion == "" {
				return fmt.Errorf("--on-question is required")
			}
			if f.dryRun {
				return nil
			}
			return runListen(cmd.Context(), f)
		},
	}
	cmd.Flags().StringVar(&f.onQuestion, "on-question", "", "command to run when a question arrives (required)")
	cmd.Flags().StringVar(&f.profile, "profile", "", "config profile to use (overrides CLAWGARD_PROFILE)")
	cmd.Flags().StringVar(&f.relayURL, "relay-url", "", "override relay URL")
	cmd.Flags().DurationVar(&f.questionTimeout, "question-timeout", 120*time.Second, "max wall-clock for each hook invocation")
	cmd.Flags().BoolVar(&f.dryRun, "dry-run", false, "validate flags and exit (test helper)")
	return cmd
}

func runListen(parent context.Context, f listenFlags) error {
	cfgPath, err := config.DefaultConfigPath()
	if err != nil {
		return err
	}
	cfg, err := config.Load(config.LoadOptions{
		ConfigPath:   cfgPath,
		Profile:      f.profile,
		RelayURLFlag: f.relayURL,
	})
	if err != nil {
		return err
	}

	keyPath := filepath.Join(filepath.Dir(cfgPath), "buddy.key")
	apiKey, err := auth.Read(keyPath)
	if err != nil {
		return fmt.Errorf("read api key: %w (run `clawgard-buddy setup`)", err)
	}

	ctx, cancel := signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	runner := hook.NewRunner(hook.RunnerOptions{Command: f.onQuestion, Timeout: f.questionTimeout})
	dialer := client.New(client.Options{RelayURL: cfg.RelayURL + "/v1/buddy/connect", APIKey: apiKey})

	return RunSupervisor(ctx, SupervisorDeps{Dialer: dialer, Runner: runner})
}
