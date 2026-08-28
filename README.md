# ExperimentAnalysis

## Idea

ExperimentAnalysis reconstructs a **completed** CatSwarm flight or simulation from logs so an operator can scrub, play, and compare pose sources after the fact. Inputs are PX4 `.ulg` files (one per drone), System Manager CSVs, and Hardware Adapter logs. The UI shows a time-aligned 3D reconstruction (body-axis triads, extra pose avatars, optional velocity arrows), a linked 2D OSM map, Plotly channel plots, ground markers, and distance measurements.

Each experiment is a reopenable folder: import or pull more files later without replacing what is already in `raw/`. Sparse physical drone ids (2, 3, 4, …) stay as-is; a missing airframe or missing Pi logs is valid.

It is **not** a live ground station. It does not send GS commands, does not arm/disarm, does not share ports with Observation Board (`5000`/`6173`) or CatSwarm GUI (`3001`/`5173`).

## Architecture

Laptop-local two-process web app:

| Process | Bind | Role |
|---|---|---|
| FastAPI (uvicorn) | `127.0.0.1:6400` | Ingest, extract, query |
| Vite / React | `127.0.0.1:6473` | UI; proxies `/api` to `:6400` |

```
ExperimentAnalysis/
  README.md / UPDATES.md
  docs/                      # product spec + implementation plans
  experiments/               # gitignored per-experiment folders
  web/backend/               # FastAPI, extractors, ingest adapters
  web/frontend/              # React, Tailwind, Plotly; Cesium lazy-loaded
  start.sh / attach.sh / killall.sh / install.sh
```

Tmux session: `experiment_analysis` (windows `backend` / `frontend`). `killall.sh` only touches 6400/6473.

### Data flow

1. Create or open `experiments/<slug>/` (`slug` = name sanitized to `[a-zA-Z0-9_-]+`).
2. Import local files and/or pull SSH (Pi logs) / MAVLink (ulog) into **append-only** `raw/drone_<id>/`.
3. Rebuild extracts `raw/` → `derived/` parquet + `sync.json` (`t_max_s`, per-drone ARM).
4. The browser holds a time cursor `T` (seconds, experiment time). Playback is client-side (`requestAnimationFrame`).
5. UI queries `/api/.../pose?t=` and `/api/.../series`. The browser never parses `.ulg`.

Simulation uses the same pipeline; only the ingest source differs (local `system_manager/logs/` / `hardware_adapter/logs/` instead of SSH).

### Experiment package

```
experiments/Baseball/
  manifest.json              # drones, ssh/mavlink, sources, sync offsets, ui layout
  raw/drone_2/…              # original files (never rewritten in place)
  derived/sync.json          # ARM times, synced flags, t_max_s
  derived/drone_2/*.parquet  # ulog topics + sm_system_manager.parquet
  derived/ha/drone_2/        # HA parquet when parseable
```

`derived/` is disposable and rebuilt from `raw/` + `manifest.json`. Name collisions in `raw/` get a UTC suffix. `experiments/` is gitignored; tiny synthetic fixtures live under `web/backend/tests/fixtures/`.

### Ingest

| Adapter | What it does |
|---|---|
| Files | Directory or file list: `.ulg`, `*system_manager*.csv`, HA `*adapter_diag*.log` / `*mavlink*.{txt,log}`. Id from `Group3RLcat(?P<id>\d+)_` or `_d(?P<id>\d+)`. Unknown names → `needs_id`; UI prompts and a second import with `{assignments: {filename: id}}` copies only those files. |
| SSH | List SM/HA files on the Pi (`rsync --list-only`), operator picks which to copy. Probe `~/RL/CatSwarm/{system_manager,hardware_adapter}/logs/`, then `~/RL/system_manager/logs/`, `~/RL/hardware_adapter/logs/`, `~/RL/logs/` (Python HA `../logs` from adapter cwd). Publickey only, 30s list timeout. Copy streams SSE progress (bar at top of picker from 0%); Cancel kills rsync and drops partials. Missing dir skipped. Password never logged or returned. Empty remote / timeout does not delete existing `raw/`. |
| MAVLink | List onboard logs via **TCP** (`tcp:{ssh.host}:5760`) or **serial** (`/dev/ttyUSB0`, baud 57600). Operator picks a log; download streams SSE progress (same top-of-picker bar) and writes one `.ulg` per drone. Existing ulog is replaced only after confirm. **No `COMMAND_LONG`.** |

Successful pull triggers rebuild (same as import). Header **Update** writes `manifest.name` and persists D1..DN from Drone #; it does not re-extract.

Seeded hosts when drones 2 and 4 are first created: D2 `192.168.31.30`, D4 `192.168.31.152`, user `pi`, MAVLink tcp 5760. D3 has no host until the operator adds one.

### Time sync

PX4 time starts at FC boot; Pi `local_ts` starts with the companion process. Drones are not powered together. Observation Board takeoff ARM is the common wall-clock event.

- **Ulog ARM:** first `vehicle_status.arming_state == 2`; else `actuator_armed.armed == 1`. `T = (t_us - t_arm_ulog_us) / 1e6`.
- **SM ARM:** first row `S4_TAKEOFF` or numeric `4`, using **`local_ts`** (never SM `timestamp`). `T = local_ts - t_arm_sm`.
- `synced` iff ulog ARM was found. Unsynced drones get a banner and use first-sample time.
- `manifest.sync.manual_offsets_s[str(drone_id)]` is added after ARM mapping: `T_final = T_arm + offset`.

### World frame and pose

3D is **ENU metres**, Z up. Origin = mean GPS LLA at `T = 0` (ARM). NED→ENU: `e = ned.y`, `n = ned.x`, `u = -ned.z`. WGS84 `A = 6378137`.

Avatars (several at once per drone): `ekf_ned`, `gps`, `sm_ned`, `sm_lla`. Attitude is a FRD body triad (RGB = body x/y/z) from `vehicle_attitude`. SM-only drones (no ulog `present`) still draw SM points. Map uses `gps` or `sm_lla`. Trails downsample at 20 Hz.

Channel ids: `{drone_id}.{source}.{topic}.{field}` with source `ulog` | `sm` | `ha`. SM series uses `local_ts` + `t_sm`. HA series is first-sample-relative (not PX4 ARM microseconds).

### UI

- Tabs: **Sources** (New, Drone # as a single 1–9 count matching the number of D1..DN rows, Update persists those ids and the Name field, per-drone Pi IP, Import / SSH / MAVLink; each drone row includes a summary of ULG filename, date/time, SM/HA log names, and analysis color) and **Analysis** (drone visibility, Plotly/Cesium 3D, 2D OSM map, Plotly plots, timeline). Experiment switcher stays in the chrome. Tabs change only by click. Drone list is a column, one row per drone (sparse saved ids fill D1..Dmax so the count and the list match). Import opens a path/Browse dialog on that row. SSH is green when SM/HA logs are present; a failed pull shows an error on that row. SSH lists Pi log files for the operator to pick (many dates); copy shows a progress bar at the top of the picker (0% immediately, then SSE updates) and Cancel stops rsync. MAVLink lists vehicle logs for the operator to pick; download shows the same top-of-picker progress and Cancel stops the transfer; replacing an existing `.ulg` needs confirmation. Picker stays open through rebuild.
- Center: Plotly 3D (default) or Cesium globe (lazy `import("cesium")`, OSM tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, **no Ion token**).
- Linked 2D Plotly `scattermap` (`style: "open-street-map"`). Ground click / globe click → markers (LLA in manifest); two selected markers show haversine + 3D ENU distance.
- Timeline: slider, play / reverse / pause, speeds 0.25/1/2/4, numeric T. `tMax` comes from `GET .../duration` (`t_max_s` from rebuild), not a 60s placeholder.
- Default NED channel plots plus extra Plotly panes from a tree picker with search, Apply, and Edit. `ui` in the manifest restores layout on reopen.

GET experiment JSON **strips** `ssh.password` (file on disk may still hold it). Failed HTTP responses are not treated as success in the UI client.

### API (`/api`)

| Method | Path | Role |
|---|---|---|
| GET | `/health` | `{ok: true}` |
| GET/POST | `/experiments` | List / create `{name}` |
| GET | `/experiments/{slug}` | Manifest (password redacted) |
| PATCH | `/experiments/{slug}/manifest` | Merge ui / drone hosts |
| POST | `/experiments/{slug}/drones` | `{id}` |
| POST | `/experiments/{slug}/import` | `{paths, assignments?, drone_id?}` |
| POST | `/browse-folder` | native folder dialog; `{path: string \| null}` or 503 |
| POST | `/experiments/{slug}/pull` | `{drone_id, adapters: ["ssh"\|"mavlink"]}` then rebuild |
| POST | `/experiments/{slug}/ssh/logs` | `{drone_id}` → `{ok, logs}` (SM/HA files on the Pi) |
| POST | `/experiments/{slug}/ssh/copy` | `{drone_id, files: [{remote, name}]}` then rebuild |
| POST | `/experiments/{slug}/mavlink/logs` | `{drone_id, transport: "tcp"\|"serial", serial?}` → `{ok, logs}` |
| POST | `/experiments/{slug}/mavlink/download` | `{drone_id, log_id, transport, confirm_replace?, serial?}`; one `.ulg` per drone |
| POST | `/experiments/{slug}/rebuild` | Re-extract + re-sync |
| GET | `/experiments/{slug}/duration` | `{t_max_s}` |
| GET | `/experiments/{slug}/pose` | Query `t` — avatars, attitude, vectors |
| GET | `/experiments/{slug}/series` | Query `channels` (repeatable), optional `t0`,`t1` |
| GET | `/experiments/{slug}/topics` | drone → source → topic → fields |
| PATCH | `/experiments/{slug}/markers` | Replace marker list |

Unknown slug: 404. Import/pull: 200 with `{ok, drones}`; `ok` if at least one adapter/drone succeeded.

### Tech stack

Python 3.11+, FastAPI, uvicorn, pyulog, pyarrow, pandas, pymavlink, pytest. Vite, React, TypeScript, Tailwind, react-plotly.js, CesiumJS (lazy). No Flask/Dash shell, no Electron.

### Non-goals

Live telemetry, GS commands, RTK, companion deploy, mission/SysManager JSON editing, training/RL export, committing `experiments/` or Baseball ulogs.

## Run

```bash
./install.sh          # backend .venv + npm install
./start.sh            # tmux experiment_analysis on 6400 + 6473
./attach.sh           # attach that session
./killall.sh          # stop only 6400/6473
```

Frontend `--port=` overrides UI only; API stays 6400. CORS is pinned to 6473.

**Unit tests** (no TESTFLIGHTS): `cd web/backend && .venv/bin/python -m pytest` (default `-m "not e2e"`) and `cd web/frontend && npx vitest run`.

**E2E** (fail if Baseball files missing, no skip):

```bash
cd web/backend && .venv/bin/python -m pytest tests/test_e2e_baseball.py -m e2e -v -o addopts=
cd web/frontend && npx playwright test e2e/baseball.spec.ts
```

## Operator guide (Baseball reconstruction)

New experiment, set Drone # to **4** (four rows D1–D4 appear; Update persists them), then Import `/home/valentin/RL/TESTFLIGHTS/Baseball` on D2, D3, and D4 (filename ids pick the matching ulog):

- `Group3RLcat2_log_41_2026-8-25-17-05-30.ulg`
- `Group3RLcat3_log_18_2026-8-25-17-05-26.ulg`
- `Group3RLcat4_log_28_2026-8-25-17-05-24.ulg`

Import rebuilds extracts: pose, duration (~155–161 s after ARM), and default NED plots. D3 reconstructs from ulog alone. Later pull from D2/D4 appends SM/HA without replacing ulogs.

| Drone | SSH host | Notes |
|---|---|---|
| D1 | — | slot present; no Baseball ulog |
| D2 | `192.168.31.30` | user `pi`; MAVLink `tcp:192.168.31.30:5760` |
| D3 | — | ulog-only (no SSH host seeded) |
| D4 | `192.168.31.152` | user `pi`; MAVLink `tcp:192.168.31.152:5760` |

Local sim: Import a directory of SITL `.ulg`, or `system_manager/logs/` / `hardware_adapter/logs/`.

## Reading order for agents

1. Read this `README.md` (mandatory if present).
2. Read `UPDATES.md` (mandatory) for the change history and current state before working.
3. Product spec (if behavior is unclear): `docs/2026-08-27-experiment-analysis-design.md`.
