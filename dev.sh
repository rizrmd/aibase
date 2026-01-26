#!/bin/bash

# Development script to run backend and frontend concurrently

echo "Starting development environment..."

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to kill background processes on exit
cleanup() {
    echo ""
    echo "Stopping development servers..."
    kill $(jobs -p) 2>/dev/null
    wait 2>/dev/null
    echo "Done."
    exit
}

# Trap SIGINT and SIGTERM to run cleanup
trap cleanup SIGINT SIGTERM

# Start backend with hot-reload
echo "Starting backend with hot-reload..."
cd "$SCRIPT_DIR"
SKIP_MIGRATION=true bun --watch run backend/src/server/index.ts &
BACKEND_PID=$!

# Wait for backend to be healthy using health check endpoint
echo "Waiting for backend to be ready..."
BACKEND_URL="http://localhost:5040"
MAX_WAIT=30
WAIT_TIME=0
HEALTH_CHECK_INTERVAL=1

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
  if curl -s -f "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo "✓ Backend is ready!"
    break
  fi
  echo "  Waiting for backend... (${WAIT_TIME}s)"
  sleep $HEALTH_CHECK_INTERVAL
  WAIT_TIME=$((WAIT_TIME + HEALTH_CHECK_INTERVAL))
done

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
  echo "✗ Backend failed to start within ${MAX_WAIT}s"
  echo "  Check backend logs for errors"
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi

# Start frontend
echo "Starting frontend..."
cd "$SCRIPT_DIR/frontend"
bun run dev &
FRONTEND_PID=$!

echo ""
echo "================================"
echo "Development servers started!"
echo "================================"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "================================"
echo ""

# Wait for all background processes
wait
