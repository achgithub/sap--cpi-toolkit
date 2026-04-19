#!/usr/bin/env bash
# Push images to ghcr.io for production (Kyma) deployment.
# Prerequisites:
#   1. Run build-images.sh first (or pass a tag that already exists locally)
#   2. Authenticate: echo $GITHUB_PAT | docker login ghcr.io -u achgithub --password-stdin
set -euo pipefail

REGISTRY="ghcr.io/achgithub"
TAG="${1:-latest}"

echo "==> Pushing images (tag: $TAG)"

for IMAGE in \
  cpi-toolkit-portal \
  cpi-toolkit-worker \
  cpi-toolkit-adapter-control \
  cpi-toolkit-groovy-runner \
  cpi-toolkit-mock-http \
  cpi-toolkit-sftp-adapter
do
  docker push "$REGISTRY/$IMAGE:$TAG"
done

echo "==> Done. Deploy with: kubectl apply -k deployments/k8s/kyma"
