# Use the official Bun image
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies and build in one stage
FROM base AS builder

# Copy package files
COPY backend/package.json backend/bun.lock ./
COPY frontend/ ./frontend/

# Install backend dependencies
RUN bun install

# Install frontend dependencies and build
WORKDIR /app/frontend
RUN bun install && bun run build

# Production image
FROM base AS runner

# Create non-root user
RUN addgroup --system --gid 1001 appuser && \
    adduser --system --uid 1001 --ingroup appuser appuser

# Copy backend dependencies and source
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/build ./frontend/build
COPY backend/src ./src
COPY backend/drizzle ./drizzle
COPY backend/tsconfig.json backend/jsconfig.json ./

# Set permissions
RUN chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 5040

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5040/health || exit 1

# Start the server
CMD ["bun", "run", "src/orpc/server.ts"]