# Multi-stage Dockerfile for full-stack application
FROM oven/bun:1.1-alpine AS frontend-build

# Build frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# Production stage
FROM oven/bun:1.1-alpine

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

# Start backend server (serves frontend static files)
CMD ["bun", "run", "backend/src/server/index.ts"]
