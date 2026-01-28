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

# Load .env file if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    echo "Loaded .env file"
fi

# Check if AIMEOW is enabled
if [ "$AIMEOW" = "true" ]; then
    # Setup aimeow paths
    AIMEOW_DIR="$SCRIPT_DIR/bins/aimeow"
    AIMEOW_BINARY_NAME="aimeow"

    # Determine platform-specific binary name
    if [ "$(uname)" = "Darwin" ]; then
        AIMEOW_BINARY_NAME="aimeow.macos"
    elif [ "$(uname)" = "Linux" ]; then
        AIMEOW_BINARY_NAME="aimeow.linux"
    fi

    AIMEOW_BINARY="$AIMEOW_DIR/$AIMEOW_BINARY_NAME"

    # Check if we need to build (binary doesn't exist or is older than source)
    NEED_BUILD=0
    if [ ! -f "$AIMEOW_BINARY" ]; then
        NEED_BUILD=1
    elif [ "$AIMEOW_DIR/main.go" -nt "$AIMEOW_BINARY" ]; then
        NEED_BUILD=1
    fi

    # Build aimeow if needed
    if [ $NEED_BUILD -eq 1 ]; then
        echo "Building aimeow WhatsApp service..."
        cd "$AIMEOW_DIR"
        go build -ldflags="-s -w" -o "$AIMEOW_BINARY_NAME" main.go
        if [ $? -ne 0 ]; then
            echo "Failed to build aimeow"
            exit 1
        fi
    fi

    # Create aimeow data directory
    AIMEOW_DATA_DIR="$SCRIPT_DIR/data/services/whatsapp"
    mkdir -p "$AIMEOW_DATA_DIR/files"

    # Start aimeow service
    echo "Starting aimeow WhatsApp service..."
    cd "$AIMEOW_DATA_DIR"
    PORT=7031 \
    BASE_URL=http://localhost:7031 \
    CALLBACK_URL=http://localhost:5040/api/whatsapp/webhook \
    DATA_DIR=. \
    "$AIMEOW_BINARY" &
    AIMEOW_PID=$!

    echo "AIMEOW PID: $AIMEOW_PID"
fi

# Start backend with hot-reload
echo "Starting backend with hot-reload..."
cd "$SCRIPT_DIR"
bun --watch --env-file=.env run backend/src/server/index.ts &
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
if [ ! -z "$AIMEOW_PID" ]; then
    echo "AIMEOW PID: $AIMEOW_PID"
fi
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "================================"
echo ""

# Wait for all background processes
wait
