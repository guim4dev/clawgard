package client

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/coder/websocket"
)

type Options struct {
	RelayURL string // ws:// or wss:// (full path, incl. /v1/buddy/connect)
	APIKey   string
}

type Client struct {
	opts Options
}

func New(opts Options) *Client { return &Client{opts: opts} }

func (c *Client) Dial(ctx context.Context) (*websocket.Conn, error) {
	u := c.opts.RelayURL
	// Permit passing https:// and auto-upgrade to wss://
	switch {
	case strings.HasPrefix(u, "https://"):
		u = "wss://" + strings.TrimPrefix(u, "https://")
	case strings.HasPrefix(u, "http://"):
		u = "ws://" + strings.TrimPrefix(u, "http://")
	}
	hdr := http.Header{}
	hdr.Set("Authorization", "Bearer "+c.opts.APIKey)
	conn, _, err := websocket.Dial(ctx, u, &websocket.DialOptions{HTTPHeader: hdr})
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", u, err)
	}
	return conn, nil
}

type InFrame struct {
	Type       string `json:"type"`
	ThreadID   string `json:"threadId"`
	Content    string `json:"content"`
	AskerEmail string `json:"askerEmail,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

type OutFrame struct {
	Type     string `json:"type"`
	ThreadID string `json:"threadId"`
	Content  string `json:"content,omitempty"`
	Reason   string `json:"reason,omitempty"`
}
