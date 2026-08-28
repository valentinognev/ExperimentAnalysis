#!/bin/bash

PORT_ARG="6473"
BACKEND_PORT="6400"
TMUX_SESSION="experiment_analysis"

show_help() {
    echo "Usage: ./start.sh [options]"
    echo ""
    echo "Options:"
    echo "  --port=PORT       Frontend port (default: 6473)"
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Experiment Analysis..."
echo "Cleaning up lingering processes..."

"${SCRIPT_DIR}/killall.sh" --port="${PORT_ARG}"

if tmux has-session -t "${TMUX_SESSION}" 2>/dev/null; then
    tmux kill-session -t "${TMUX_SESSION}" 2>/dev/null || true
fi

sleep 1

echo "Launching tmux session '${TMUX_SESSION}'..."
tmux new-session -d -s "${TMUX_SESSION}" -n "backend"
tmux new-window -t "${TMUX_SESSION}" -n "frontend"

echo "  [1/2] Starting Backend (127.0.0.1:${BACKEND_PORT})..."
tmux send-keys -t "${TMUX_SESSION}:backend" "cd '${SCRIPT_DIR}/web/backend' && source .venv/bin/activate && uvicorn app:app --host 127.0.0.1 --port ${BACKEND_PORT}" ENTER

echo "  [2/2] Starting Frontend (127.0.0.1:${PORT_ARG})..."
tmux send-keys -t "${TMUX_SESSION}:frontend" "cd '${SCRIPT_DIR}/web/frontend' && CHOKIDAR_USEPOLLING=1 npm run dev -- --host 127.0.0.1 --port ${PORT_ARG}" ENTER

echo ""
echo "========================================"
echo " Experiment Analysis is running."
echo "========================================"
echo "  Link: http://127.0.0.1:${PORT_ARG}"
echo "  API:  http://127.0.0.1:${BACKEND_PORT}"
echo "  Tmux: tmux attach -t ${TMUX_SESSION}"
echo "========================================"
