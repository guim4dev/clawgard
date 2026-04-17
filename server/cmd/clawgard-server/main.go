package main

import (
	"fmt"
	"os"
)

func run(args []string) (string, error) {
	if len(args) < 2 {
		return "usage: clawgard-server <serve|version|migrate>", nil
	}
	return fmt.Sprintf("subcommand %q not implemented yet", args[1]), nil
}

func main() {
	out, err := run(os.Args)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(out)
}
