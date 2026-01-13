# Multi-stage Dockerfile for full-stack application
FROM oven/bun:alpine AS frontend-build

# Build frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lockb* ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# Production stage
FROM oven/bun:alpine

# Install DuckDB and Pandoc
RUN apk add --no-cache curl pandoc && \
    curl -L https://github.com/duckdb/duckdb/releases/download/v1.1.3/duckdb_cli-linux-amd64.zip -o /tmp/duckdb.zip && \
    unzip /tmp/duckdb.zip -d /tmp/ && \
    mv /tmp/duckdb /usr/local/bin/ && \
    chmod +x /usr/local/bin/duckdb && \
    rm /tmp/duckdb.zip && \
    apk del curl

WORKDIR /app

# Copy backend
COPY backend/package.json backend/bun.lockb* ./backend/
WORKDIR /app/backend
RUN bun install --frozen-lockfile --production
COPY backend/ ./

# Copy built frontend (backend will serve these files)
WORKDIR /app
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Expose only backend port (serves both API and frontend)
EXPOSE 5040

# Set environment to production
ENV NODE_ENV=production

# Create data directory for persistent storage
RUN mkdir -p /app/data

# Define volume for persistent data
# This includes: todos, memory, uploaded files, and conversation data
VOLUME ["/app/data"]

# Start backend server (serves frontend static files)
CMD ["bun", "run", "backend/src/server/index.ts"]
