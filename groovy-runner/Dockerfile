# ── Stage 1: Build fat JAR ────────────────────────────────────────────────────
FROM gradle:8-jdk21-alpine AS build
WORKDIR /app

# Cache dependency downloads before copying source
COPY settings.gradle build.gradle ./
RUN gradle dependencies --no-daemon --quiet

# Build
COPY src ./src
RUN gradle shadowJar --no-daemon --quiet

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

COPY --from=build /app/build/libs/groovy-runner.jar .

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8082/health || exit 1

# -Xmx keeps the JVM within the pod memory limit
CMD ["java", "-Xmx400m", "-jar", "groovy-runner.jar"]
