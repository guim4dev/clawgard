package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"

	"github.com/clawgard/clawgard/buddy-cli/internal/auth"
	"github.com/clawgard/clawgard/buddy-cli/internal/config"
)

type SetupInput struct {
	RelayURL   string
	APIKey     string
	Profile    string
	ConfigPath string
	APIKeyPath string
}

func newSetupCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "setup",
		Short: "Interactively configure the buddy (relay URL + API key)",
		RunE: func(cmd *cobra.Command, args []string) error {
			in, err := promptSetup()
			if err != nil {
				return err
			}
			if err := RunSetup(in); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "wrote config to %s\nwrote api key to %s\n", in.ConfigPath, in.APIKeyPath)
			return nil
		},
	}
}

func promptSetup() (SetupInput, error) {
	cfgPath, err := config.DefaultConfigPath()
	if err != nil {
		return SetupInput{}, err
	}
	keyPath := filepath.Join(filepath.Dir(cfgPath), "buddy.key")

	in := SetupInput{ConfigPath: cfgPath, APIKeyPath: keyPath}
	qs := []*survey.Question{
		{Name: "Profile", Prompt: &survey.Input{Message: "Profile name:", Default: "default"}},
		{Name: "RelayURL", Prompt: &survey.Input{Message: "Relay URL (e.g. https://clawgard.acme.internal):"}, Validate: survey.Required},
		{Name: "APIKey", Prompt: &survey.Password{Message: "Buddy API key:"}, Validate: survey.Required},
	}
	if err := survey.Ask(qs, &in); err != nil {
		return SetupInput{}, err
	}
	return in, nil
}

func RunSetup(in SetupInput) error {
	if in.Profile == "" {
		in.Profile = "default"
	}
	if err := os.MkdirAll(filepath.Dir(in.ConfigPath), 0700); err != nil {
		return err
	}

	profiles := map[string]map[string]string{}
	if b, err := os.ReadFile(in.ConfigPath); err == nil {
		if jerr := json.Unmarshal(b, &profiles); jerr != nil {
			return fmt.Errorf("existing config is not valid JSON: %w", jerr)
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	profiles[in.Profile] = map[string]string{"relayUrl": in.RelayURL}

	out, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(in.ConfigPath, out, 0600); err != nil {
		return err
	}
	return auth.Write(in.APIKeyPath, in.APIKey)
}
