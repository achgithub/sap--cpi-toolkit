// Package keygen provides ephemeral PGP, SSH, and X.509 certificate generation.
// All keys are generated in-memory and never stored server-side.
package keygen

import (
	"bytes"
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"time"

	"golang.org/x/crypto/openpgp"        //nolint:staticcheck
	"golang.org/x/crypto/openpgp/armor"  //nolint:staticcheck
	"golang.org/x/crypto/openpgp/packet" //nolint:staticcheck
	"golang.org/x/crypto/ssh"
)

const maxCertValidityDays = 90

// PGPResult holds armored PGP public and private keys.
type PGPResult struct {
	PublicKey  string
	PrivateKey string
}

// SSHResult holds an SSH public key (authorized_keys format) and OpenSSH private key.
type SSHResult struct {
	PublicKey  string
	PrivateKey string
}

// CertResult holds a PEM-encoded self-signed certificate and RSA private key.
type CertResult struct {
	Certificate string
	PrivateKey  string
}

// GeneratePGP creates an RSA PGP keypair for the given identity.
// bits must be 2048 or 4096; any other value defaults to 2048.
func GeneratePGP(name, email string, bits int) (PGPResult, error) {
	if bits != 2048 && bits != 4096 {
		bits = 2048
	}

	cfg := &packet.Config{
		DefaultHash:            crypto.SHA256,
		DefaultCipher:          packet.CipherAES256,
		DefaultCompressionAlgo: packet.CompressionZLIB,
		RSABits:                bits,
	}

	entity, err := openpgp.NewEntity(name, "", email, cfg)
	if err != nil {
		return PGPResult{}, fmt.Errorf("generate PGP entity: %w", err)
	}

	var privBuf bytes.Buffer
	privWriter, err := armor.Encode(&privBuf, openpgp.PrivateKeyType, nil)
	if err != nil {
		return PGPResult{}, fmt.Errorf("armor private key: %w", err)
	}
	if err := entity.SerializePrivate(privWriter, nil); err != nil {
		return PGPResult{}, fmt.Errorf("serialize private key: %w", err)
	}
	privWriter.Close()

	var pubBuf bytes.Buffer
	pubWriter, err := armor.Encode(&pubBuf, openpgp.PublicKeyType, nil)
	if err != nil {
		return PGPResult{}, fmt.Errorf("armor public key: %w", err)
	}
	if err := entity.Serialize(pubWriter); err != nil {
		return PGPResult{}, fmt.Errorf("serialize public key: %w", err)
	}
	pubWriter.Close()

	return PGPResult{
		PublicKey:  pubBuf.String(),
		PrivateKey: privBuf.String(),
	}, nil
}

// GenerateSSH creates an SSH keypair. keyType must be "rsa" or "ed25519".
// bits only applies to RSA; Ed25519 key size is fixed at 256 bits.
func GenerateSSH(keyType, comment string, bits int) (SSHResult, error) {
	switch keyType {
	case "rsa":
		return generateSSHRSA(comment, bits)
	case "ed25519":
		return generateSSHEd25519(comment)
	default:
		return SSHResult{}, fmt.Errorf("unsupported key type %q — use rsa or ed25519", keyType)
	}
}

func generateSSHRSA(comment string, bits int) (SSHResult, error) {
	if bits != 2048 && bits != 4096 {
		bits = 4096
	}
	key, err := rsa.GenerateKey(rand.Reader, bits)
	if err != nil {
		return SSHResult{}, fmt.Errorf("generate RSA key: %w", err)
	}
	return marshalSSHPair(key, &key.PublicKey, comment)
}

func generateSSHEd25519(comment string) (SSHResult, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return SSHResult{}, fmt.Errorf("generate Ed25519 key: %w", err)
	}
	return marshalSSHPair(priv, pub, comment)
}

func marshalSSHPair(privKey crypto.Signer, pubKey interface{}, comment string) (SSHResult, error) {
	sshPub, err := ssh.NewPublicKey(pubKey)
	if err != nil {
		return SSHResult{}, fmt.Errorf("ssh public key: %w", err)
	}

	// MarshalAuthorizedKey returns "type base64key\n"; insert comment before the newline.
	pubLine := string(ssh.MarshalAuthorizedKey(sshPub))
	if comment != "" {
		pubLine = pubLine[:len(pubLine)-1] + " " + comment + "\n"
	}

	privBlock, err := ssh.MarshalPrivateKey(privKey, comment)
	if err != nil {
		return SSHResult{}, fmt.Errorf("marshal private key: %w", err)
	}

	return SSHResult{
		PublicKey:  pubLine,
		PrivateKey: string(pem.EncodeToMemory(privBlock)),
	}, nil
}

// GenerateCert creates a self-signed X.509 certificate (RSA 2048).
// validityDays is capped at maxCertValidityDays (90).
func GenerateCert(commonName, org string, dnsNames []string, validityDays int) (CertResult, error) {
	if validityDays <= 0 || validityDays > maxCertValidityDays {
		validityDays = maxCertValidityDays
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return CertResult{}, fmt.Errorf("generate key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return CertResult{}, fmt.Errorf("generate serial: %w", err)
	}

	subject := pkix.Name{CommonName: commonName}
	if org != "" {
		subject.Organization = []string{org}
	}

	sans := dnsNames
	if len(sans) == 0 {
		sans = []string{commonName}
	}

	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               subject,
		DNSNames:              sans,
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().Add(time.Duration(validityDays) * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return CertResult{}, fmt.Errorf("create certificate: %w", err)
	}

	certPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER}))
	keyPEM := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))

	return CertResult{
		Certificate: certPEM,
		PrivateKey:  keyPEM,
	}, nil
}
