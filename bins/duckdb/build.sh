#!/bin/bash
# Build script for DuckDB binary manager

set -e

echo "Building DuckDB binary manager..."

# Determine platform
OS="$(uname -s)"
ARCH="$(uname -m)"

# Normalize OS names to lowercase for Go
case "$OS" in
    Darwin)
        OS="darwin"
        ;;
    Linux)
        OS="linux"
        ;;
    MINGW*|MSYS*|CYGWIN*|Windows)
        OS="windows"
        ;;
esac

# Normalize architecture names
case "$ARCH" in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64|arm64)
        ARCH="arm64"
        ;;
esac

# Output binary name
BINARY_NAME="duckdb-manager"
if [ "$OS" = "Windows" ]; then
    BINARY_NAME="duckdb-manager.exe"
fi

# Build for current platform
echo "Building for $OS-$ARCH..."
GOOS="$OS" GOARCH="$ARCH" go build -o "$BINARY_NAME" .

# Make binary executable (Unix-like systems only)
if [ "$OS" != "windows" ]; then
    chmod +x "$BINARY_NAME"
fi

echo "✓ Built $BINARY_NAME"
