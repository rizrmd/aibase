#!/bin/bash

# Ensure .env file exists
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Please edit .env with your actual values."
  else
    echo "Warning: .env.example not found. Please create .env manually."
  fi
fi

# Check and install backend dependencies
if [ ! -d "backend/node_modules" ]; then
  cd backend && bun install && cd ..
fi

# Check and install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
  cd frontend && bun install && cd ..
fi

# Kill any processes on ports 5040 (backend) and 5050 (frontend)
echo "Freeing ports 5040 and 5050..."
lsof -ti:5040 | xargs kill -9 2>/dev/null || true
lsof -ti:5050 | xargs kill -9 2>/dev/null || true

# Start the development environment
zellij --layout dev.kdl
