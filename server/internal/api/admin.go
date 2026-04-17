package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/clawgard/clawgard/server/internal/auth"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// MountAdmin wires admin endpoints under /v1/admin. Callers must have injected
// an Identity with Admin=true into the context (normally via AdminMiddleware).
func MountAdmin(r chi.Router, s *store.Store) {
	r.Route("/v1/admin", func(r chi.Router) {
		r.Use(requireAdmin)
		r.Get("/buddies", adminListBuddies(s))
		r.Post("/buddies", adminCreateBuddy(s))
		r.Patch("/buddies/{id}", adminUpdateBuddy(s))
		r.Delete("/buddies/{id}", adminDeleteBuddy(s))
		r.Get("/threads", adminListThreads(s))
		r.Get("/threads/{id}", adminGetThread(s))
	})
}

func requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := IdentityFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "no identity")
			return
		}
		if !id.Admin {
			writeError(w, http.StatusForbidden, "forbidden", "admin required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type createBuddyRequest struct {
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ACL         store.ACL `json:"acl"`
}

func adminCreateBuddy(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in createBuddyRequest
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "malformed json")
			return
		}
		if in.Name == "" {
			writeError(w, http.StatusBadRequest, "bad_request", "name required")
			return
		}
		if in.ACL.Mode == "" {
			in.ACL.Mode = "public"
		}

		key, err := auth.GenerateAPIKey()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "keygen failed")
			return
		}
		hash, err := auth.HashAPIKey(key)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "hash failed")
			return
		}

		caller, _ := IdentityFromContext(r.Context())
		b, err := s.Buddies().Create(r.Context(), store.NewBuddy{
			Name:        in.Name,
			Description: in.Description,
			OwnerEmail:  caller.Email,
			APIKeyHash:  hash,
			ACL:         in.ACL,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "create failed: "+err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"buddy":  toBuddyResp(b),
			"apiKey": key,
		})
	}
}

func adminListBuddies(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		buddies, err := s.Buddies().ListAll(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		out := make([]map[string]any, len(buddies))
		for i, b := range buddies {
			out[i] = toBuddyResp(b)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

type updateBuddyRequest struct {
	Description *string    `json:"description,omitempty"`
	ACL         *store.ACL `json:"acl,omitempty"`
}

func adminUpdateBuddy(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad id")
			return
		}
		var in updateBuddyRequest
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad body")
			return
		}
		b, err := s.Buddies().Update(r.Context(), id, store.UpdateBuddy{Description: in.Description, ACL: in.ACL})
		if errors.Is(err, store.ErrBuddyNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "buddy not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, toBuddyResp(b))
	}
}

func adminDeleteBuddy(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad id")
			return
		}
		if err := s.Buddies().Delete(r.Context(), id); err != nil {
			if errors.Is(err, store.ErrBuddyNotFound) {
				writeError(w, http.StatusNotFound, "not_found", "buddy not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func adminListThreads(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filter := parseThreadFilter(r)
		total, err := s.Threads().CountWithFilter(r.Context(), filter)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		threads, err := s.Threads().ListWithFilter(r.Context(), filter)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		items := make([]map[string]any, len(threads))
		for i, t := range threads {
			items[i] = toThreadResp(t, nil)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"items": items,
			"total": total,
		})
	}
}

func adminGetThread(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad id")
			return
		}
		t, err := s.Threads().Get(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "thread not found")
			return
		}
		msgs, err := s.Messages().List(r.Context(), t.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, toThreadResp(t, msgs))
	}
}

// Response marshaling helpers.
func toBuddyResp(b store.Buddy) map[string]any {
	out := map[string]any{
		"id":          b.ID.String(),
		"name":        b.Name,
		"description": b.Description,
		"acl":         b.ACL,
		"ownerEmail":  b.OwnerEmail,
		"createdAt":   b.CreatedAt,
		"online":      false,
	}
	if b.LastSeenAt != nil {
		out["lastSeenAt"] = *b.LastSeenAt
	}
	return out
}

func toThreadResp(t store.Thread, msgs []store.Message) map[string]any {
	out := map[string]any{
		"id":             t.ID.String(),
		"buddyId":        t.BuddyID.String(),
		"hatchlingEmail": t.HatchlingEmail,
		"status":         t.Status,
		"turns":          t.Turns,
		"createdAt":      t.CreatedAt,
	}
	if t.ClosedAt != nil {
		out["closedAt"] = *t.ClosedAt
	}
	if msgs != nil {
		out["messages"] = msgs
	}
	return out
}

func parseThreadFilter(r *http.Request) store.ListFilter {
	var f store.ListFilter
	q := r.URL.Query()
	if v := q.Get("buddyId"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.BuddyID = &id
		}
	}
	f.HatchlingEmail = q.Get("hatchlingEmail")
	if v := q.Get("from"); v != "" {
		if ts, err := time.Parse(time.RFC3339, v); err == nil {
			f.From = &ts
		}
	}
	if v := q.Get("to"); v != "" {
		if ts, err := time.Parse(time.RFC3339, v); err == nil {
			f.To = &ts
		}
	}

	// Pagination: page (1-based) + pageSize, defaults 1 / 25, pageSize capped at 200.
	pageSize := 25
	if v := q.Get("pageSize"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 200 {
				n = 200
			}
			pageSize = n
		}
	}
	page := 1
	if v := q.Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	f.Limit = pageSize
	f.Offset = (page - 1) * pageSize
	return f
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
