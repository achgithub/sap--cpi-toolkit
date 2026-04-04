# Groovy Runner — stub
# Full implementation comes in step 9.
# For now: starts and responds to health checks so the stack comes up cleanly.
FROM eclipse-temurin:21-jre-alpine

EXPOSE 8082

# Minimal health-check HTTP server using netcat
# Replaced with real Groovy runtime in step 9
RUN apk add --no-cache busybox-extras

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8082/health || exit 1

# Simple sh loop: respond "ok" to any HTTP GET /health
CMD ["sh", "-c", "while true; do echo -e 'HTTP/1.1 200 OK\\r\\nContent-Length: 3\\r\\nContent-Type: text/plain\\r\\n\\rok\\n' | nc -l -p 8082 -q 1; done"]
