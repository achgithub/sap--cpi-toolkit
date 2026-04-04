# Groovy Runner — stub
# Full implementation comes in step 9.
# For now: starts and responds to /health so the stack comes up cleanly.
FROM eclipse-temurin:21-jre-alpine

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8082/health || exit 1

# Serve a minimal HTTP health response using BusyBox nc (no -q flag on Alpine)
CMD ["sh", "-c", "while true; do printf 'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: text/plain\r\n\r\nok' | nc -l -p 8082; done"]
