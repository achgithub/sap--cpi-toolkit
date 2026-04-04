package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

const sessionTTL        = 8 * time.Hour
const sessionCookieName = "toolkit_session"

// Session holds the authenticated user identity for one browser session.
type Session struct {
	ID        string
	UserID    string
	UserEmail string
	UserName  string
	ExpiresAt time.Time
}

func (s *Session) valid() bool {
	return s != nil && time.Now().Before(s.ExpiresAt)
}

// SessionStore is a thread-safe in-memory session store.
// Sessions are cleaned up in the background every 15 minutes.
type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func newSessionStore() *SessionStore {
	s := &SessionStore{sessions: make(map[string]*Session)}
	go s.cleanup()
	return s
}

// Create stores a new session and returns it.
func (s *SessionStore) Create(userID, userEmail, userName string) *Session {
	sess := &Session{
		ID:        randomHex(32),
		UserID:    userID,
		UserEmail: userEmail,
		UserName:  userName,
		ExpiresAt: time.Now().Add(sessionTTL),
	}
	s.mu.Lock()
	s.sessions[sess.ID] = sess
	s.mu.Unlock()
	return sess
}

// Get returns a session by ID if it exists and has not expired.
func (s *SessionStore) Get(id string) (*Session, bool) {
	s.mu.RLock()
	sess, ok := s.sessions[id]
	s.mu.RUnlock()
	if !ok || !sess.valid() {
		return nil, false
	}
	return sess, true
}

// Delete removes a session (logout).
func (s *SessionStore) Delete(id string) {
	s.mu.Lock()
	delete(s.sessions, id)
	s.mu.Unlock()
}

func (s *SessionStore) cleanup() {
	ticker := time.NewTicker(15 * time.Minute)
	for range ticker.C {
		s.mu.Lock()
		for id, sess := range s.sessions {
			if !sess.valid() {
				delete(s.sessions, id)
			}
		}
		s.mu.Unlock()
	}
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}
