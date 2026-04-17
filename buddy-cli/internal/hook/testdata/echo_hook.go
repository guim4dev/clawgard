//go:build ignore

// Test-only helper binary. Reads one JSON question from stdin,
// emits one JSON answer on stdout whose content echoes the question.
package main

import (
	"encoding/json"
	"os"
)

type in struct {
	ThreadID string `json:"threadId"`
	Question string `json:"question"`
	Turn     int    `json:"turn"`
}

type out struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

func main() {
	var q in
	if err := json.NewDecoder(os.Stdin).Decode(&q); err != nil {
		os.Exit(2)
	}
	_ = json.NewEncoder(os.Stdout).Encode(out{Type: "answer", Content: "echo:" + q.Question})
}
