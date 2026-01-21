# Multi-stage Dockerfile for full-stack application
# All stages use Debian bookworm for binary compatibility

# Stage 1: Build frontend
FROM node:20-bookworm-slim AS frontend-build

# Install Bun
RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/* && \
    curl -fsSL https://bun.sh/install.sh | bash && \
    export BUN_INSTALL=$HOME/.bun && \
    export PATH="$BUN_INSTALL/bin:$PATH"

# Build frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lockb* ./
RUN bun install
COPY frontend/ ./
RUN bun run build

# Stage 2: Build aimeow with CGO for SQLite
FROM golang:1.25-bookworm AS aimeow-build

# Install build dependencies (gcc already included in bookworm)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app/bins/aimeow

# Copy aimeow source files
COPY bins/aimeow/go.mod bins/aimeow/go.sum ./
RUN go mod download

COPY bins/aimeow/ ./

# Install swag and generate swagger docs
RUN go install github.com/swaggo/swag/cmd/swag@latest
RUN $(go env GOPATH)/bin/swag init

# Build aimeow for Linux with CGO (required for mattn/go-sqlite3)
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o aimeow.linux .

# Stage 3: Production stage
FROM node:20-bookworm-slim

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y curl pandoc sqlite3 && \
    curl -L https://github.com/duckdb/duckdb/releases/download/v1.1.3/duckdb_cli-linux-amd64.zip -o /tmp/duckdb.zip && \
    unzip /tmp/duckdb.zip -d /tmp/ && \
    mv /tmp/duckdb /usr/local/bin/ && \
    chmod +x /usr/local/bin/duckdb && \
    rm -rf /tmp/duckdb.zip /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install.sh | bash && \
    export BUN_INSTALL=$HOME/.bun && \
    export PATH="$BUN_INSTALL/bin:$PATH"

WORKDIR /app

# Copy backend
COPY backend/package.json backend/bun.lockb* ./backend/
WORKDIR /app/backend
RUN bun install --frozen-lockfile --production
COPY backend/ ./

# Copy built frontend (backend will serve these files)
WORKDIR /app
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy aimeow binary from aimeow-build stage
COPY --from=aimeow-build /app/bins/aimeow/aimeow.linux ./bins/aimeow/
RUN chmod +x ./bins/aimeow/aimeow.linux

# Copy aimeow docs from aimeow-build stage
COPY --from=aimeow-build /app/bins/aimeow/docs ./bins/aimeow/docs

# Copy pre-built start binary (built locally without CGO)
COPY bins/start/start.linux ./
RUN chmod +x ./start.linux

# Copy .env file if it exists (for production configuration)
# Note: This is optional. You can also use --env-file or -e flags at runtime.
# Uncomment the next line if you want to bake .env into the image (NOT recommended for secrets)
# COPY .env ./

# Expose backend port and WhatsApp API port
EXPOSE 5040 7031

# Set environment to production (can be overridden)
ENV NODE_ENV=production

# Default WhatsApp API URL (can be overridden with -e flag or .env file)
ENV WHATSAPP_API_URL=http://localhost:7031/api/v1

# Create data directory for persistent storage
RUN mkdir -p /app/data

# Define volume for persistent data
# This includes: todos, memory, uploaded files, and conversation data
VOLUME ["/app/data"]

# Skip frontend dependency install (dist is pre-built)
# aimeow is built in Docker with CGO
ENV SKIP_FRONTEND_INSTALL=1
ENV SKIP_AIMEOW_BUILD=1

# Start all services via start.linux (which runs backend, Qdrant, and aimeow)
CMD ["./start.linux"]
