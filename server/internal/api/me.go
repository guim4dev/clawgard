package api

import (
	"encoding/json"
	"net/http"
)

type BuddyOwnerLookup interface {
	HasBuddiesOwnedBy(email string) (bool, error)
}

type MeResponse struct {
	Email string   `json:"email"`
	Roles []string `json:"roles"`
}

type MeConfig struct {
	Signer      *SessionSigner
	AdminEmails map[string]bool
	BuddyStore  BuddyOwnerLookup
}

type MeHandler struct{ cfg MeConfig }

func NewMeHandler(cfg MeConfig) *MeHandler { return &MeHandler{cfg: cfg} }

func (h *MeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	email, err := h.cfg.Signer.Read(r)
	if err != nil {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}
	roles := []string{"hatchling"}
	if h.cfg.AdminEmails[email] {
		roles = append([]string{"admin"}, roles...)
	}
	if h.cfg.BuddyStore != nil {
		owner, err := h.cfg.BuddyStore.HasBuddiesOwnedBy(email)
		if err != nil {
			http.Error(w, "lookup failed", http.StatusInternalServerError)
			return
		}
		if owner {
			roles = append([]string{"buddy_owner"}, roles...)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(MeResponse{Email: email, Roles: dedupe(roles)})
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
