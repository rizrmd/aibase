#!/bin/bash

set -e

echo "Building cross-platform binaries..."

# Get the script directory location (where this build.sh script lives)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Get the project root (2 levels up from bins/start)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Change to the script directory so go build can find the module
cd "$SCRIPT_DIR"

# Build with stripped symbols for all platforms
echo "→ Building Windows binary..."
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "$PROJECT_ROOT/start.win.exe"

echo "→ Building Linux binary..."
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$PROJECT_ROOT/start.linux"

echo "→ Building macOS binary..."
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "$PROJECT_ROOT/start.macos"

echo ""
echo "Compressing binaries with UPX..."

# Check if UPX is installed
if ! command -v upx &> /dev/null; then
    echo "Warning: UPX not found. Install with: brew install upx"
    echo "Skipping compression..."
else
    echo "→ Compressing Windows binary..."
    upx --best --lzma --force "$PROJECT_ROOT/start.win.exe" 2>/dev/null || true

    echo "→ Compressing Linux binary..."
    upx --best --lzma --force "$PROJECT_ROOT/start.linux" 2>/dev/null || true

    echo "→ Skipping macOS compression (UPX breaks code signing)..."
fi

echo ""
echo "Code signing macOS binary..."
if command -v codesign &> /dev/null; then
    codesign -s - -f "$PROJECT_ROOT/start.macos" 2>/dev/null || echo "Warning: Code signing failed"
else
    echo "Warning: codesign not found (macOS only)"
fi

echo ""
echo "✓ Build complete!"
echo ""
ls -lh "$PROJECT_ROOT"/start.*
