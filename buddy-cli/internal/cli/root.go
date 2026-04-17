package cli

import "github.com/spf13/cobra"

type BuildInfo struct {
	Version string
	Commit  string
	Date    string
}

func NewRootCmd(info BuildInfo) *cobra.Command {
	root := &cobra.Command{
		Use:           "clawgard-buddy",
		Short:         "Clawgard buddy daemon",
		SilenceUsage:  true,
		SilenceErrors: false,
	}
	root.AddCommand(newVersionCmd(info))
	root.AddCommand(newSetupCmd())
	return root
}
