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

# Start backend
echo "Starting backend..."
cd "$SCRIPT_DIR"
bun run backend/src/server/index.ts &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

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
