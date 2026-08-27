# ExperimentAnalysis

## Idea

ExperimentAnalysis is a CatSwarm sibling app that reconstructs completed flights or simulations from logs: PX4 `.ulg` per drone, System Manager CSVs, and Hardware Adapter logs. Operators scrub and play a time-aligned 3D reconstruction with 2D channel plots, ground markers, and distance measurements. Experiments can be reopened later to add files that were missing at first import. It is not a live ground station and does not send commands.

## Architecture

Laptop-local web app with two processes:

| Process | Bind | Role |
|---|---|---|
| FastAPI (uvicorn) | `127.0.0.1:6400` | Ingest, extract, query |
| Vite / React | `127.0.0.1:6473` | UI; proxies `/api` to `:6400` |

```
ExperimentAnalysis/
  README.md
  UPDATES.md
  .gitignore                 # experiments/, venv, node_modules, secrets
  docs/                      # product spec + implementation plans
  experiments/               # gitignored per-experiment folders
  web/backend/               # FastAPI, extractors, ingest adapters
  web/frontend/              # React, Tailwind, Plotly
```

Each experiment lives under `experiments/<name>/` with `raw/` (append-only imports) and `derived/` (parquet + sync metadata). The UI holds a time cursor; playback is client-side. The browser never parses `.ulg` directly.

**Local import paths:** point Import at a directory of SITL `.ulg` files, or at simulation log folders such as `system_manager/logs/` (System Manager CSVs) and `hardware_adapter/logs/` (adapter diag / mavlink logs). Files whose names lack a drone id are listed in `needs_id`; the UI prompts for ids and re-imports with assignments.

## Operator guide (Baseball reconstruction)

Golden dataset: import `/home/valentin/RL/TESTFLIGHTS/Baseball` — three `.ulg` files for drones 2, 3, and 4. Rebuild populates pose and default NED plots; toggle Cesium vs Plotly in the 3D view.

| Drone | SSH host | Notes |
|---|---|---|
| D2 | `192.168.31.30` | user `pi`; MAVLink `tcp:192.168.31.30:5760` |
| D3 | — | ulog-only (no SSH host seeded) |
| D4 | `192.168.31.152` | user `pi`; MAVLink `tcp:192.168.31.152:5760` |

Start backend on `127.0.0.1:6400` and UI on `127.0.0.1:6473` (`start.sh` or manual uvicorn + Vite). Pull SSH/MAVLink from D2/D4 appends SM/HA logs without replacing imported ulogs.

## Reading order for agents

1. Read this `README.md` (mandatory if present).
2. Read `UPDATES.md` (mandatory) for the change history and current state before working.
