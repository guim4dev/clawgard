package main

import "testing"

func TestRunUsage(t *testing.T) {
	out, _ := run([]string{"clawgard-server"})
	if out == "" {
		t.Fatal("expected usage output")
	}
}

func TestRunVersion(t *testing.T) {
	out, err := run([]string{"clawgard-server", "version"})
	if err != nil {
		t.Fatal(err)
	}
	if out == "" {
		t.Fatal("expected version string")
	}
}
