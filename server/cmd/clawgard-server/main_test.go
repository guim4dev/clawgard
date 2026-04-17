package main

import "testing"

func TestRunReturnsUsageWhenNoArgs(t *testing.T) {
	out, err := run([]string{"clawgard-server"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out == "" {
		t.Fatal("expected non-empty usage output")
	}
}
