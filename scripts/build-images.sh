#!/usr/bin/env bash
# Build all service images tagged for ghcr.io.
# Run from repo root. No push — Docker Desktop k8s uses the local daemon cache.
set -euo pipefail

REGISTRY="ghcr.io/achgithub"
TAG="${1:-latest}"

echo "==> Building images (tag: $TAG)"

docker build -f Dockerfile.portal        -t "$REGISTRY/cpi-toolkit-portal:$TAG"          .
docker build -f Dockerfile.worker        -t "$REGISTRY/cpi-toolkit-worker:$TAG"           .
docker build -f Dockerfile.cpi-dev       -t "$REGISTRY/cpi-toolkit-cpi-dev:$TAG"          .
docker build -f Dockerfile.adapter-control -t "$REGISTRY/cpi-toolkit-adapter-control:$TAG" .
docker build -f groovy-runner/Dockerfile -t "$REGISTRY/cpi-toolkit-groovy-runner:$TAG"    groovy-runner/
docker build -f adapters/mock-http/Dockerfile -t "$REGISTRY/cpi-toolkit-mock-http:$TAG"   adapters/mock-http/
docker build -f adapters/sftp/Dockerfile -t "$REGISTRY/cpi-toolkit-sftp-adapter:$TAG"     adapters/sftp/

echo "==> Done. Deploy with: kubectl apply -k deployments/k8s/local"
