package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/clawgard/clawgard/server/internal/router"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// MountHatchling wires hatchling endpoints. Requires identity middleware upstream.
func MountHatchling(r chi.Router, s *store.Store, reg *router.Registry) {
	r.Get("/v1/buddies", hatchlingListBuddies(s))
	r.Post("/v1/threads", hatchlingOpenThread(s, reg))
	r.Get("/v1/threads/{id}", hatchlingGetThread(s))
	r.Post("/v1/threads/{id}/messages", hatchlingPostClarification(s, reg))
	r.Post("/v1/threads/{id}/close", hatchlingCloseThread(s, reg))
}

func hatchlingListBuddies(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := IdentityFromContext(r.Context())
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "no identity")
			return
		}
		buddies, err := s.Buddies().ListForCaller(r.Context(), id.Email, id.Groups)
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

type openThreadReq struct {
	BuddyID  string `json:"buddyId"`
	Question string `json:"question"`
}

func hatchlingOpenThread(s *store.Store, reg *router.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, _ := IdentityFromContext(r.Context())
		var in openThreadReq
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "malformed json")
			return
		}
		buddyID, err := uuid.Parse(in.BuddyID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad buddyId")
			return
		}
		if in.Question == "" {
			writeError(w, http.StatusBadRequest, "bad_request", "question required")
			return
		}

		buddy, err := s.Buddies().GetByID(r.Context(), buddyID)
		if errors.Is(err, store.ErrBuddyNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "buddy not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		if !aclAllows(buddy.ACL, id) {
			writeError(w, http.StatusForbidden, "forbidden", "not allowed to ask this buddy")
			return
		}
		if !reg.Online(buddy.ID) {
			writeError(w, http.StatusServiceUnavailable, "buddy_offline", "buddy is not currently online")
			return
		}

		th, err := s.Threads().Open(r.Context(), buddy.ID, id.Email)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		if _, err := s.Messages().Append(r.Context(), store.NewMessage{
			ThreadID: th.ID, Role: "hatchling", Type: "question", Content: in.Question,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		if _, err := s.Threads().IncrementTurns(r.Context(), th.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}

		if err := reg.SendQuestion(r.Context(), buddy.ID, router.InFrame{
			Type: "question", ThreadID: th.ID.String(), Content: in.Question, AskerEmail: id.Email,
		}); err != nil {
			writeError(w, http.StatusServiceUnavailable, "buddy_offline", "buddy dropped")
			return
		}

		writeJSON(w, http.StatusCreated, toThreadResp(th, nil))
	}
}

func hatchlingGetThread(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, _ := IdentityFromContext(r.Context())
		threadID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad id")
			return
		}

		th, err := s.Threads().Get(r.Context(), threadID)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "thread not found")
			return
		}
		if th.HatchlingEmail != id.Email && !id.Admin {
			writeError(w, http.StatusForbidden, "forbidden", "not your thread")
			return
		}

		// Long-poll: wait up to `waitSeconds` for new messages beyond `since`.
		wait := 0
		if v := r.URL.Query().Get("waitSeconds"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 55 {
				wait = n
			}
		}
		var since time.Time
		if v := r.URL.Query().Get("since"); v != "" {
			if ts, err := time.Parse(time.RFC3339Nano, v); err == nil {
				since = ts
			}
		}

		if wait > 0 {
			deadline := time.Now().Add(time.Duration(wait) * time.Second)
			ticker := time.NewTicker(250 * time.Millisecond)
			defer ticker.Stop()
			for {
				msgs, err := s.Messages().ListSince(r.Context(), threadID, since)
				if err == nil && len(msgs) > 0 {
					break
				}
				if time.Now().After(deadline) {
					break
				}
				select {
				case <-r.Context().Done():
					return
				case <-ticker.C:
				}
			}
			th, _ = s.Threads().Get(r.Context(), threadID)
		}

		msgs, err := s.Messages().List(r.Context(), threadID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, toThreadResp(th, msgs))
	}
}

type postClarReq struct {
	Content string `json:"content"`
}

func hatchlingPostClarification(s *store.Store, reg *router.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, _ := IdentityFromContext(r.Context())
		threadID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad id")
			return
		}
		var in postClarReq
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Content == "" {
			writeError(w, http.StatusBadRequest, "bad_request", "content required")
			return
		}

		th, err := s.Threads().Get(r.Context(), threadID)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "thread not found")
			return
		}
		if th.HatchlingEmail != id.Email {
			writeError(w, http.StatusForbidden, "forbidden", "not your thread")
			return
		}
		if th.Status != "open" {
			writeError(w, http.StatusConflict, "conflict", "thread closed")
			return
		}

		if _, err := s.Threads().IncrementTurns(r.Context(), threadID); err != nil {
			if errors.Is(err, store.ErrTurnCapExceeded) {
				_ = s.Threads().Close(r.Context(), threadID, "turn_cap_reached")
				writeError(w, http.StatusConflict, "turn_cap_exceeded", "clarification turns exhausted")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}

		if _, err := s.Messages().Append(r.Context(), store.NewMessage{
			ThreadID: threadID, Role: "hatchling", Type: "clarification", Content: in.Content,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}

		if err := reg.SendQuestion(r.Context(), th.BuddyID, router.InFrame{
			Type: "clarification", ThreadID: threadID.String(), Content: in.Content, AskerEmail: id.Email,
		}); err != nil {
			writeError(w, http.StatusServiceUnavailable, "buddy_offline", "buddy dropped")
			return
		}

		w.WriteHeader(http.StatusAccepted)
	}
}

func hatchlingCloseThread(s *store.Store, reg *router.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, _ := IdentityFromContext(r.Context())
		threadID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "bad id")
			return
		}
		th, err := s.Threads().Get(r.Context(), threadID)
		if err != nil {
			writeError(w, http.StatusNotFound, "not_found", "thread not found")
			return
		}
		if th.HatchlingEmail != id.Email && !id.Admin {
			writeError(w, http.StatusForbidden, "forbidden", "not your thread")
			return
		}
		_ = s.Threads().Close(r.Context(), threadID, "hatchling_closed")
		_ = reg.SendQuestion(r.Context(), th.BuddyID, router.InFrame{
			Type: "close", ThreadID: threadID.String(),
		})
		reg.ClearWaiter(threadID)
		w.WriteHeader(http.StatusNoContent)
	}
}

// aclAllows enforces buddy ACL against an identity.
func aclAllows(acl store.ACL, id Identity) bool {
	switch acl.Mode {
	case "public":
		return true
	case "users":
		for _, e := range acl.Users {
			if e == id.Email {
				return true
			}
		}
		return false
	case "group":
		for _, g := range id.Groups {
			if g == acl.GroupID {
				return true
			}
		}
		return false
	default:
		return false
	}
}
