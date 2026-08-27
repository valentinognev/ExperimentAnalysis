#!/bin/bash

# Scoped cleanup for Experiment Analysis only (ports 6400 / 6473).
# Leaves ObservationBoard and other CatSwarm services untouched.

PORT_ARG="6473"
BACKEND_PORT="6400"
TMUX_SESSION="experiment_analysis"

show_help() {
    echo "Usage: ./killall.sh [options]"
    echo ""
    echo "Options:"
    echo "  --port=PORT       Frontend port to free (default: 6473)"
    echo "  --help            Show this help message"
    echo ""
}

for i in "$@"; do
  case $i in
    --port=*)
      PORT_ARG="${i#*=}"
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      ;;
  esac
done

kill_port() {
    local port="$1"
    if lsof -ti:"${port}" >/dev/null 2>&1; then
        lsof -ti:"${port}" | xargs kill -9 2>/dev/null || true
    fi
}

echo "Killing Experiment Analysis processes..."

if tmux has-session -t "${TMUX_SESSION}" 2>/dev/null; then
    echo "  Closing tmux session '${TMUX_SESSION}'..."
    tmux kill-session -t "${TMUX_SESSION}" 2>/dev/null || true
fi

pkill -f "uvicorn app:app.*--port ${BACKEND_PORT}" 2>/dev/null || true
pkill -f "uvicorn app:app.*--port=${BACKEND_PORT}" 2>/dev/null || true

echo "  Cleaning up ports ${BACKEND_PORT} (backend) and ${PORT_ARG} (frontend)..."
kill_port "${BACKEND_PORT}"
kill_port "${PORT_ARG}"

echo "Experiment Analysis cleaned up."
