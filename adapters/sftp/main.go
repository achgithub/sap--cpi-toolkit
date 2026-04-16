package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type AdapterConfig struct {
	ID                    string       `json:"id"`
	Name                  string       `json:"name"`
	Type                  string       `json:"type"`
	BehaviorMode          string       `json:"behavior_mode"`
	AuthMode              string       `json:"auth_mode"`
	SSHHostKey            string       `json:"ssh_host_key"`
	SSHHostKeyFingerprint string       `json:"ssh_host_key_fingerprint"`
	SSHPublicKey          string       `json:"ssh_public_key"` // authorized_keys format; empty = accept any key
	Credentials           *Credentials `json:"credentials"`
}

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// diskHandler serves the SFTP subsystem from a real directory on the host
// filesystem (mounted via Docker volume). All paths are jail-rooted to prevent
// traversal outside the volume.
type diskHandler struct {
	root string
}

func newDiskHandler(root string) (*diskHandler, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, fmt.Errorf("failed to create sftp root %s: %w", root, err)
	}
	return &diskHandler{root: filepath.Clean(root)}, nil
}

// realPath converts a client-supplied path (absolute within the SFTP jail)
// to a real filesystem path, rejecting any attempt to escape the root.
func (h *diskHandler) realPath(p string) (string, error) {
	// filepath.Clean of "/<arbitrary>" strips double-slashes and dot segments.
	abs := filepath.Join(h.root, filepath.Clean("/"+p))
	if !strings.HasPrefix(abs, h.root+string(filepath.Separator)) && abs != h.root {
		return "", sftp.ErrSSHFxPermissionDenied
	}
	return abs, nil
}

func (h *diskHandler) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return nil, err
	}
	return os.Open(real)
}

func (h *diskHandler) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(real), 0755); err != nil {
		return nil, err
	}
	return os.OpenFile(real, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
}

func (h *diskHandler) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return nil, err
	}

	switch r.Method {
	case "List":
		entries, err := os.ReadDir(real)
		if err != nil {
			return nil, err
		}
		infos := make([]os.FileInfo, 0, len(entries))
		for _, e := range entries {
			info, err := e.Info()
			if err != nil {
				continue
			}
			infos = append(infos, info)
		}
		return listerAt(infos), nil

	case "Stat", "Lstat":
		info, err := os.Stat(real)
		if err != nil {
			return nil, err
		}
		return listerAt([]os.FileInfo{info}), nil
	}
	return nil, fmt.Errorf("unsupported list method: %s", r.Method)
}

func (h *diskHandler) Filecmd(r *sftp.Request) error {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return err
	}
	switch r.Method {
	case "Setstat":
		return nil
	case "Rename":
		target, err := h.realPath(r.Target)
		if err != nil {
			return err
		}
		return os.Rename(real, target)
	case "Rmdir":
		return os.Remove(real)
	case "Remove":
		return os.Remove(real)
	case "Mkdir":
		return os.MkdirAll(real, 0755)
	case "Symlink":
		return sftp.ErrSSHFxOpUnsupported
	default:
		return fmt.Errorf("unsupported command: %s", r.Method)
	}
}

// listerAt satisfies sftp.ListerAt over a pre-fetched []os.FileInfo.
type listerAt []os.FileInfo

func (l listerAt) ListAt(ls []os.FileInfo, offset int64) (int, error) {
	idx := int(offset)
	if idx >= len(l) {
		return 0, io.EOF
	}
	n := copy(ls, l[idx:])
	if idx+n >= len(l) {
		return n, io.EOF
	}
	return n, nil
}

func main() {
	adapterID := os.Getenv("ADAPTER_ID")
	controlPlaneURL := os.Getenv("CONTROL_PLANE_URL")
	sftpRoot := os.Getenv("SFTP_ROOT_DIR")
	hostKeyPath := os.Getenv("HOST_KEY_PATH")

	if adapterID == "" {
		log.Fatal("ADAPTER_ID environment variable is required")
	}
	if controlPlaneURL == "" {
		controlPlaneURL = "http://control-plane:8080"
	}
	if sftpRoot == "" {
		sftpRoot = "/data/sftp"
	}
	if hostKeyPath == "" {
		hostKeyPath = "/data/host_key"
	}

	log.Printf("SFTP Adapter started (ID: %s, root: %s)", adapterID, sftpRoot)

	handler, err := newDiskHandler(sftpRoot)
	if err != nil {
		log.Fatalf("Failed to initialise SFTP root: %v", err)
	}

	// Fetch initial config for the SSH host key.  Non-fatal if the control
	// plane isn't ready yet — we fall back to the persisted key on disk.
	config, err := fetchConfig(adapterID, controlPlaneURL)
	if err != nil {
		log.Printf("Warning: failed to fetch initial config: %v — using persisted/generated host key", err)
		config = &AdapterConfig{}
	}

	hostKey, err := loadOrGenerateHostKey(config.SSHHostKey, hostKeyPath)
	if err != nil {
		log.Fatalf("Failed to load host key: %v", err)
	}
	log.Printf("SSH host key fingerprint: %s", ssh.FingerprintSHA256(hostKey.PublicKey()))

	sshConfig := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			cfg, err := fetchConfig(adapterID, controlPlaneURL)
			if err != nil {
				return nil, fmt.Errorf("config unavailable")
			}
			return handlePasswordAuth(conn.User(), string(pass), cfg)
		},
		PublicKeyCallback: func(conn ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			cfg, err := fetchConfig(adapterID, controlPlaneURL)
			if err != nil {
				return nil, fmt.Errorf("config unavailable")
			}
			return handlePublicKeyAuth(conn.User(), key, cfg)
		},
	}
	sshConfig.AddHostKey(hostKey)

	listener, err := net.Listen("tcp", ":22")
	if err != nil {
		log.Fatalf("Failed to listen on port 22: %v", err)
	}
	defer listener.Close()
	log.Printf("SFTP Server listening on :22 (root: %s)", sftpRoot)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Accept error: %v", err)
			continue
		}
		go handleConnection(conn, sshConfig, handler, adapterID, controlPlaneURL)
	}
}

func reportActivity(adapterID, controlPlaneURL string) {
	go func() {
		c := &http.Client{Timeout: 2 * time.Second}
		c.Post(fmt.Sprintf("%s/adapter-activity/%s", controlPlaneURL, adapterID), "application/json", nil)
	}()
}

func handleConnection(conn net.Conn, sshConfig *ssh.ServerConfig, handler *diskHandler, adapterID, controlPlaneURL string) {
	reportActivity(adapterID, controlPlaneURL)
	defer conn.Close()

	sshConn, chans, reqs, err := ssh.NewServerConn(conn, sshConfig)
	if err != nil {
		if err.Error() != "EOF" {
			log.Printf("SSH handshake error: %v", err)
		}
		return
	}
	defer sshConn.Close()
	log.Printf("SSH login from %s as %s", sshConn.RemoteAddr(), sshConn.User())

	go ssh.DiscardRequests(reqs)

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
			continue
		}
		channel, requests, err := newChannel.Accept()
		if err != nil {
			log.Printf("Could not accept channel: %v", err)
			continue
		}
		go handleChannel(channel, requests, handler)
	}
}

func handleChannel(channel ssh.Channel, requests <-chan *ssh.Request, handler *diskHandler) {
	defer channel.Close()
	for req := range requests {
		if req.Type == "subsystem" && string(req.Payload[4:]) == "sftp" {
			req.Reply(true, nil)
			server := sftp.NewRequestServer(channel, sftp.Handlers{
				FileGet:  handler,
				FilePut:  handler,
				FileList: handler,
				FileCmd:  handler,
			})
			if err := server.Serve(); err != nil && err != io.EOF {
				log.Printf("SFTP server error: %v", err)
			}
			return
		}
		req.Reply(false, nil)
	}
}

func handlePasswordAuth(user, pass string, config *AdapterConfig) (*ssh.Permissions, error) {
	if config.BehaviorMode == "failure" {
		return nil, fmt.Errorf("authentication failed")
	}
	if config.AuthMode == "key" {
		return nil, fmt.Errorf("password auth disabled")
	}
	if config.Credentials != nil {
		if user == config.Credentials.Username && pass == config.Credentials.Password {
			return &ssh.Permissions{}, nil
		}
		return nil, fmt.Errorf("invalid credentials")
	}
	// No credentials configured — accept anything in success mode
	return &ssh.Permissions{}, nil
}

func handlePublicKeyAuth(user string, key ssh.PublicKey, config *AdapterConfig) (*ssh.Permissions, error) {
	if config.BehaviorMode == "failure" {
		return nil, fmt.Errorf("authentication failed")
	}
	if config.AuthMode == "password" {
		return nil, fmt.Errorf("public key auth disabled")
	}
	if config.SSHPublicKey != "" {
		authorizedKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(config.SSHPublicKey))
		if err != nil {
			return nil, fmt.Errorf("invalid configured public key")
		}
		if ssh.FingerprintSHA256(authorizedKey) != ssh.FingerprintSHA256(key) {
			return nil, fmt.Errorf("public key not authorized")
		}
		return &ssh.Permissions{}, nil
	}
	// No public key configured and mode is key/any — accept any key in success mode
	return &ssh.Permissions{}, nil
}

func fetchConfig(adapterID, controlPlaneURL string) (*AdapterConfig, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("%s/adapter-config/%s", controlPlaneURL, adapterID))
	if err != nil {
		return nil, fmt.Errorf("failed to fetch config: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("config endpoint returned %d: %s", resp.StatusCode, string(body))
	}
	var config AdapterConfig
	if err := json.NewDecoder(resp.Body).Decode(&config); err != nil {
		return nil, fmt.Errorf("failed to decode config: %w", err)
	}
	return &config, nil
}

// loadOrGenerateHostKey resolves the host key in priority order:
//  1. PEM supplied via control-plane config (e.g. a known, pinned key)
//  2. Key persisted on disk at keyPath (stable across restarts)
//  3. Generate a new key and persist it to keyPath for next time
func loadOrGenerateHostKey(keyPEM, keyPath string) (ssh.Signer, error) {
	if keyPEM != "" {
		return signerFromPEM([]byte(keyPEM))
	}

	if keyPath != "" {
		if data, err := os.ReadFile(keyPath); err == nil {
			signer, err := signerFromPEM(data)
			if err == nil {
				return signer, nil
			}
			log.Printf("Warning: persisted host key at %s is invalid (%v) — regenerating", keyPath, err)
		}
	}

	log.Printf("Generating new SSH host key")
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate RSA key: %w", err)
	}

	// Persist so the fingerprint survives restarts.
	if keyPath != "" {
		if err := persistHostKey(privateKey, keyPath); err != nil {
			log.Printf("Warning: could not persist host key to %s: %v", keyPath, err)
		} else {
			log.Printf("Host key persisted to %s", keyPath)
		}
	}

	return ssh.NewSignerFromKey(privateKey)
}

func signerFromPEM(data []byte) (ssh.Signer, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}
	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}
	return ssh.NewSignerFromKey(privateKey)
}

func persistHostKey(key *rsa.PrivateKey, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	return os.WriteFile(path, pemBytes, 0600)
}
