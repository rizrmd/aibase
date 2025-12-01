#!/bin/bash

# Kill any processes on ports 5040 (backend) and 5050 (frontend)
echo "Freeing ports 5040 and 5050..."
lsof -ti:5040 | xargs kill -9 2>/dev/null || true
lsof -ti:5050 | xargs kill -9 2>/dev/null || true

# Start the development environment with zellij
exec zellij --layout dev-layout.kdl
