# ExperimentAnalysis

## Idea

ExperimentAnalysis reconstructs a **completed** CatSwarm flight or simulation from logs so an operator can scrub, play, and compare pose sources after the fact. Inputs are PX4 `.ulg` files (one per drone), System Manager CSVs, and Hardware Adapter logs. The UI shows a time-aligned 3D reconstruction (body-axis triads with a drone-colored center; EKF has a black ring, GPS/SM do not; legend lists one body per avatar, e.g. `D2 ekf` / `D2 gps`), a linked 2D OSM map, Plotly channel plots, ground markers, and distance measurements.

Each experiment is a reopenable folder: import or pull more files later without replacing what is already in `raw/`. Sparse physical drone ids (2, 3, 4, …) stay as-is; a missing airframe or missing Pi logs is valid.

It is **not** a live ground station. It does not send GS commands, does not arm/disarm, does not share ports with Observation Board (`5000`/`6173`) or CatSwarm GUI (`3001`/`5173`). Do not bind `6500`/`6573` for Replay.

## Architecture

Laptop-local two-process web app (do not bind `6500` / `6573`; Replay HTTP is on `:6400`):

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
3. Rebuild extracts `raw/` → `derived/` parquet + `sync.json` (`t_max_s`, per-drone ARM). Every logged ulog dataset is written (multi-instance topics as `name.00` / `name.01`).
4. The browser holds a time cursor `T` (seconds, experiment time). Playback is client-side (`requestAnimationFrame`).
5. UI queries `/api/.../pose?t=`, `/api/.../trajectory`, and `/api/.../series`. The browser never parses `.ulg`.

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
| Files | Directory or file list: `.ulg`, `*system_manager*.csv`, HA `*adapter_diag*.log` / `*mavlink*.{txt,log}`. Recognizes `obs_*.csv` as a swarm observation log (`raw/observation/`, `manifest.observation`). Id from `Group3RLcat(?P<id>\d+)_` or `_d(?P<id>\d+)`. Unknown names → `needs_id`; UI prompts and a second import with `{assignments: {filename: id}}` copies only those files. A directory with more than one SM CSV (or more than two HA files) does not copy them; the response includes `needs_pick` and the UI lists them (closest to the ULG filename stamp pre-checked, within 24h). Copying the pick replaces `sources.system_manager` / `hardware_adapter` with those files (older CSVs stay in `raw/`). Last imported `.ulg` source path is stored as `sources.ulg_origin`. |
| SSH | List SM/HA files on the Pi (`rsync --list-only`), operator picks which to copy. Probe `~/RL/CatSwarm/{system_manager,hardware_adapter}/logs/`, then `~/RL/system_manager/logs/`, `~/RL/hardware_adapter/logs/`, `~/RL/logs/` (Python HA `../logs` from adapter cwd). Publickey only, 30s list timeout. Copy streams SSE progress (bar at top of picker from 0%); Cancel kills rsync and drops partials. Missing dir skipped. Password never logged or returned. Empty remote / timeout does not delete existing `raw/`. Manifest SM/HA sources become the copied selection, not every CSV already in `raw/`. |
| MAVLink | List onboard logs via **TCP** (`tcp:{ssh.host}:5760`) or **serial** (`/dev/ttyUSB0`, baud 57600). Operator picks a log; download streams SSE progress (same top-of-picker bar) and writes one `.ulg` per drone. Existing ulog is replaced only after confirm. **No `COMMAND_LONG`.** |

Successful pull triggers rebuild (same as import). Header **Update** writes `manifest.name` and sets drone count to Drone # (add D1..DN, drop higher ids and their `raw/`/`derived/`); it does not re-extract. **New** with a Drone # already chosen also sets that count so it is not wiped when the empty experiment opens.

Seeded hosts when drones 2 and 4 are first created: D2 `192.168.31.30`, D4 `192.168.31.152`, user `pi`, MAVLink tcp 5760. D3 has no host until the operator adds one.

### Time sync

PX4 time starts at FC boot; Pi `local_ts` starts with the companion process. Drones are not powered together. Observation Board takeoff ARM is the common wall-clock event when sync mode is **ARM** (default).

Analysis has an **ARM | Manual** toggle (right of Drones). Mode and offsets live in `manifest.sync` (`mode`, `main_drone_id`, `manual_offsets_s`).

- **ARM mode:** first `vehicle_status.arming_state == 2`; else `actuator_armed.armed == 1`. `T = (t_us - t_arm_ulog_us) / 1e6`. SM ARM: first row `S4_TAKEOFF` or numeric `4`, using **`local_ts`** (never SM `timestamp`). `T = local_ts - t_arm_sm`. `synced` iff ulog ARM was found. Unsynced drones get a banner and use first-sample time. Manual offsets are ignored.
- **Manual mode:** no ARM anchors — each drone’s first sample is T=0, then `manifest.sync.manual_offsets_s[str(drone_id)]` shifts relative to the chosen main drone. The unsynced banner is hidden.

### World frame and pose

3D is **ENU metres**, Z up. Origin = mean GPS LLA at `T = 0` (ARM). NED→ENU: `e = ned.y`, `n = ned.x`, `u = -ned.z`. WGS84 `A = 6378137`.

Avatars (several at once per drone): `ekf_ned`, `gps`, `sm_ned`, `sm_lla`. Analysis drone rows have a checkbox per source that exists in pose (default all on; saved in `ui.avatars`). Attitude is a FRD body triad (RGB = body x/y/z) from `vehicle_attitude`. Each pose source has a unique marker: EKF circle with a black ring (2D and 3D), GPS filled square, SM NED hollow square, SM LLA x. Drone color still matches Observation Board. Ground markers stay white diamonds. SM-only drones (no ulog `present`) still draw SM points. 3D and 2D trails are the logged path at ≤20 Hz (`GET .../trajectory`), sliced to `t ≤ T` (reverse/jump cannot leave future geometry). Same-drone sources share the drone color and get distinct dashes when more than one trail is shown (solid when a color is unique). 2D keeps OSM tiles/camera via `uirevision`; the sliced track and current-T markers change with the slider. The 2D legend lists both trajectories and the current-T drone markers (per-source symbol), not a single combined Map entry.

Channel ids: `{drone_id}.{source}.{topic}.{field}` with source `ulog` | `sm` | `ha`, and `ob.ob.command.<field>`. Ulog `topic` is the PX4 name, plus `.00` / `.01` when the log has multiple instances (e.g. `sensor_accel.00`). SM series uses `local_ts` + `t_sm`. HA series is first-sample-relative (not PX4 ARM microseconds).

### UI

- Header Night/Day skin switch; preference `localStorage` key `ea-skin` (not the manifest). Night: dark Plotly 3D scene + Carto Dark Matter 2D/Cesium tiles. Day: light plots + OSM.
- Tabs: **Sources** (New, Drone # as a single 1–9 count matching the number of D1..DN **physical** rows, Update sets that count — growing adds ids, lowering drops drones from the end including their logs **and** any `{i}_r*` whose parent exceeds N, and writes the Name field, per-drone Pi IP, Import / SSH / MAVLink; each drone row includes a summary of ULG filename, date/time from the PX4 stamp even when a UTC collision suffix is on the file, SM/HA log names one per line, and analysis color matching Observation Board), **Analysis** (drone visibility, ARM|Manual sync toggle to the right of Drones with main + Δt offsets in Manual, per-drone pose-source checkboxes, Plotly/Cesium 3D, 2D OSM map, play bar above the channel plots, Plotly plots, command fields under Markers at T), and **Replay** (EKF2 system-wide replay of a physical drone that has a ulog; last drone + param filter/overrides persist in `localStorage` `ea-replay-session` and restore on reload when the drone still has a ulog; the Replay panel stays mounted after the first visit so switching Sources/Analysis does not drop a running job; param table keeps the number field with QGC unit (when present), enum/boolean select, and bitmask checkboxes to its right; a successful run appends first-class drone **`Di_rj`** e.g. `D2_r1` under that parent). Experiment switcher stays in the chrome. Tabs change only by click. Drone list is a column, one row per drone (sparse saved ids fill D1..Dmax so the count and the list match; each physical slot is followed by its replay children by `j`). Import / SSH / MAVLink pickers open on that drone row, not below the list. Replay rows are indented, use `replayColor`, show ULG summary (SM/HA —), and have Delete (`aria-label="Delete D2_r1"`) instead of host/Import/SSH/MAVLink. Hiding D2 does not hide D2_r1. Import: **Browse** (native GTK chooser via a system python, falling back to zenity/kdialog) to the left of the path field; the chooser adds its own Path line (paste a file or directory, Enter jumps there) and a Recent dropdown of remembered folders. The Import row's path field still prefills the last imported ulg path (`sources.ulg_origin`, per drone) when one exists and Browse starts there; when that field is empty, Browse starts in the most recent still-existing folder from the global recents list instead (recents do not replace `ulg_origin`). SSH is green when SM/HA logs are present; a failed pull shows an error on that row. SSH lists Pi log files for the operator to pick (many dates), sorted by closeness to the ULG stamp with the closest SM and HA pre-checked if within 24 hours; Copy records that selection as the active SM/HA (Sources shows those names, rebuild extracts them); older files stay in `raw/`. Copy shows a progress bar at the top of the picker (0% immediately, then SSE updates) and Cancel stops rsync. MAVLink lists vehicle logs for the operator to pick; download shows the same top-of-picker progress and Cancel stops the transfer; replacing an existing `.ulg` needs confirmation. Picker stays open through rebuild. Empty SM CSVs are skipped on rebuild (do not 500).
- Center: Plotly 3D (default) or Cesium globe (lazy `import("cesium")`, **no Ion token**). Day: OSM tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; night: Carto Dark Matter `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`. Plotly 3D legend sits inside the scene (top-left overlay); the 2D map legend sits in the map’s top margin (wrapped, extra top pad) with zoom/pan at the bottom-right so legend clicks are not covered. Both panels clip overflow so neither legend can paint over the other. Ground marker names (`M1`, …) are drawn next to the diamonds on Plotly 2D/3D (Cesium already labeled them).
- Linked 2D Plotly `scattermap` (`style: "open-street-map"` day / `"carto-darkmatter"` night): logged tracks sliced to `t ≤ T` plus current-T markers for each enabled source. Legend shows each drone marker (circle / square / hollow square / x) as well as each trajectory. Map `uirevision` keeps tiles/camera across T. Ground / globe **double-click** → markers (LLA in manifest); **right-click** a marker to remove; two selected markers show haversine + 3D ENU distance.
- Timeline: on Analysis above the NED and extra plots — play / reverse (each toggles to pause in place; the other direction is disabled), speeds 0.25/1/2/4, numeric T, and a full-width scrubber whose track matches the plot time axis so the thumb sits on T. Another matching scrubber is inserted before every third time-series figure. `tMax` comes from `GET .../duration` (`t_max_s` from rebuild), not a 60s placeholder.
- Default NED channel plots plus extra Plotly panes from a tree picker with search (empty query shows collapsed drone roots; ▸ expands), Apply, and Edit (picker opens just below that pane; Add plot still opens it under the Add plot button). Up / Down reorder extra panes (saved in `ui.plots`). Multi-instance ulog topics nest `.00` / `.01` under the shared name (channel ids unchanged). All panes share x-axis `[0, tMax]` (experiment duration) so ulog and SM ticks line up; y is independent. NED x/y/z share the drone color; solid/thick, dashed, and dotted/thin distinguish components. Extra panes cycle five colors; when two traces share a color they get distinct dashes (named Plotly styles, then custom dash lists). `ui` in the manifest restores layout on reopen.

GET experiment JSON **strips** `ssh.password` (file on disk may still hold it). Failed HTTP responses are not treated as success in the UI client.

### API (`/api`)

| Method | Path | Role |
|---|---|---|
| GET | `/health` | `{ok: true}` |
| GET/POST | `/experiments` | List / create `{name}` |
| GET | `/experiments/{slug}` | Manifest (password redacted) |
| PATCH | `/experiments/{slug}/manifest` | Merge ui / drone hosts |
| POST | `/experiments/{slug}/drones` | `{id}` |
| PUT | `/experiments/{slug}/drones` | `{count}` 1–9; keep D1..DN, drop higher ids and their `raw/`/`derived/` |
| POST | `/experiments/{slug}/import` | `{paths, assignments?, drone_id?}`; may return `needs_pick` |
| POST | `/browse-file` | native file dialog; optional `{start}` (current path); empty `{start}` uses the last remembered folder (recents, up to 8, `EA_BROWSE_RECENT` or `~/.local/state/experiment-analysis/browse-recent.json`); `{path: string \| null}` or 503 |
| POST | `/experiments/{slug}/pull` | `{drone_id, adapters: ["ssh"\|"mavlink"]}` then rebuild |
| POST | `/experiments/{slug}/ssh/logs` | `{drone_id}` → `{ok, logs}` (SM/HA files on the Pi) |
| POST | `/experiments/{slug}/ssh/copy` | `{drone_id, files: [{remote, name}]}` then rebuild |
| POST | `/experiments/{slug}/mavlink/logs` | `{drone_id, transport: "tcp"\|"serial", serial?}` → `{ok, logs}` |
| POST | `/experiments/{slug}/mavlink/download` | `{drone_id, log_id, transport, confirm_replace?, serial?}`; one `.ulg` per drone |
| POST | `/experiments/{slug}/rebuild` | Re-extract + re-sync |
| GET | `/experiments/{slug}/duration` | `{t_max_s}` |
| GET | `/experiments/{slug}/pose` | Query `t` — avatars, attitude, vectors |
| GET | `/experiments/{slug}/trajectory` | 20 Hz ENU paths per drone per avatar |
| GET | `/experiments/{slug}/series` | Query `channels` (repeatable), optional `t0`,`t1` |
| GET | `/experiments/{slug}/topics` | drone → source → topic → fields |
| PATCH | `/experiments/{slug}/markers` | Replace marker list |
| DELETE | `/experiments/{slug}/drones/{id}` | Replay ids only (`2_r1`); 400 on physical |
| POST | `/experiments/{slug}/replay/inspect` | Physical ulog → params, `run_id` |
| POST | `/experiments/{slug}/replay` | Start EKF2 replay `{run_id, drone_id, overrides}` |
| GET | `/experiments/{slug}/replay/{run_id}` | Job status (`replay_id` on success) |
| POST | `/experiments/{slug}/replay/{run_id}/stop` | SIGTERM that job |
| GET | `/experiments/{slug}/replay/{run_id}/series` | Overlay series |

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

**EKF2 Replay (Docker):** PX4 SITL still runs in `px4-noetic-firm`. Bind-mount this repo (replace any `/home/valentin/PX4Replay` mount) and **recreate** the container after the volume change:

```yaml
- /home/valentin/RL/CatSwarm/ExperimentAnalysis:/home/valentin/ExperimentAnalysis
```

```bash
cd /home/valentin/Projects/GambitonBiut/dockerfiles_firm
docker compose up -d --force-recreate --no-build px4-noetic-firm
```

Pre-flight fails if the container is not running or `/home/valentin/ExperimentAnalysis` is missing inside it. `replay_params.txt` in the SITL rootfs is often root-owned; the API writes it via `docker exec` when the host cannot. Each pre-flight also sets git `safe.directory *` in the container (the process is root; otherwise `make` dies on PX4 submodules). Replay stays on the existing two processes (`:6400` / `:6473`); do not start a second FastAPI/Vite or bind `6500`/`6573`.

**Unit tests** (no TESTFLIGHTS): `cd web/backend && .venv/bin/python -m pytest` (default `-m "not e2e"`) and `cd web/frontend && npx vitest run`.

**E2E** (fail if Baseball files missing, no skip):

```bash
cd web/backend && .venv/bin/python -m pytest tests/test_e2e_baseball.py -m e2e -v -o addopts=
cd web/frontend && npx playwright test e2e/baseball.spec.ts
```

## Operator guide (Baseball reconstruction)

New experiment, set Drone # to **4** (four rows D1–D4 appear; New or Update persists them), then Import `/home/valentin/RL/TESTFLIGHTS/Baseball` on D2, D3, and D4 (filename ids pick the matching ulog):

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
