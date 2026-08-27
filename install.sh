#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/web/backend"
VENV_DIR="${BACKEND_DIR}/.venv"
BACKEND_REQ="${BACKEND_DIR}/requirements.txt"

echo "Installing Experiment Analysis..."

echo "Setting up Backend (Python) → ${VENV_DIR}..."
if [ ! -d "${VENV_DIR}" ]; then
    echo "Creating venv at ${VENV_DIR}..."
    python3 -m venv "${VENV_DIR}"
fi

VENV_PIP="${VENV_DIR}/bin/pip"
if [ ! -x "${VENV_PIP}" ]; then
    echo "ERROR: ${VENV_PIP} missing; recreating venv..."
    rm -rf "${VENV_DIR}"
    python3 -m venv "${VENV_DIR}"
    VENV_PIP="${VENV_DIR}/bin/pip"
fi

echo "Installing backend deps from ${BACKEND_REQ}..."
"${VENV_PIP}" install -r "${BACKEND_REQ}"

echo "Setting up Frontend (Node.js)..."
cd "${SCRIPT_DIR}/web/frontend"
npm install

echo "Installation complete."
