# ExperimentAnalysis design

Date: 2026-08-27  
Status: draft for user review  
Location: this file is the product spec. Implementation plans go beside it in `docs/`.

## 1. Purpose

ExperimentAnalysis is a CatSwarm sibling app (own git, own `README.md` / `UPDATES.md`) that reconstructs a completed flight or simulation from logs: PX4 `.ulg` per drone, System Manager CSVs, Hardware Adapter logs.

The operator sees a time-aligned 3D reconstruction (drone body axes, optional extra pose sources, optional vectors) and 2D channel plots, can scrub and play forward or backward, place ground markers and measure distances, and can reopen the same experiment later to add files that were missing at first import.

It is not a live ground station. It does not send commands. It does not share ports with Observation Board or CatSwarm GUI.

## 2. Goals and non-goals

### Goals

- Import local files and/or pull from a drone IP (SSH for Pi logs, MAVLink for `.ulg`).
- Persist each experiment as a folder under `experiments/<name>/` that can be reopened and enriched.
- Switch between experiments without losing per-experiment UI state.
- Reconstruct sparse physical IDs (e.g. drones 2, 3, 4). Missing airframe or missing Pi logs is valid.
- Align drones and Pi/FC clocks using the ARM that corresponds to Observation Board takeoff (same command, unsynchronized boot clocks).
- Default 3D: Plotly on a metric ENU plane. Linked 2D OSM/scatter map. Optional globe/imagery 3D via Cesium.
- 2D plots: Plotly, user-selected ulog/SM/HA channels, add/remove panes.
- Real flights and simulation history use the same pipeline; only the ingest source differs.
- Golden operator dataset: `/home/valentin/RL/TESTFLIGHTS/Baseball/` (three `.ulg` files). D2 host `pi@192.168.31.30`, D4 host `pi@192.168.31.152`, D3 ulog present, D3 Pi later.

### Non-goals

- Live telemetry, GS commands, RTK, deploy, or pairing.
- Editing mission JSON or SysManager config.
- Training / RL export (may be added in a later spec).
- Committing experiment folders or the Baseball ulogs into git.

## 3. Architecture

Laptop-local web app:

| Process | Bind | Role |
|---|---|---|
| FastAPI (uvicorn) | `127.0.0.1:6400` | Ingest, extract, query |
| Vite / React | `127.0.0.1:6473` | UI; proxies `/api` to `:6400` |

Ports are reserved for this app. They must not reuse Observation Board (`5000` / `6173`) or GUI (`3001` / `5173`).

```
ExperimentAnalysis/
  README.md
  UPDATES.md
  .gitignore                 # experiments/, venv, node_modules, secrets
  docs/                      # this spec + implementation plans
  experiments/               # gitignored
  web/backend/               # FastAPI, extractors, ingest adapters
  web/frontend/              # React, Tailwind, Plotly; Cesium lazy-loaded
  start.sh / attach.sh / killall.sh / install.sh
```

Data flow:

1. Create or open an experiment folder.
2. Import files and/or pull SSH / MAVLink into `raw/` (append-only).
3. Extract `raw/` → `derived/` parquet + `sync.json`.
4. UI holds a time cursor `T` (seconds, experiment time). Playback is client-side.
5. UI asks the API for pose-at-`T` and for channel series. The browser never parses `.ulg`.

Simulation: same flow; adapters read local CatSwarm log directories instead of SSH.

## 4. Tech stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11+, FastAPI, uvicorn |
| ULog | `pyulog` |
| Tables | Apache Parquet via `pyarrow` |
| MAVLink log download | `pymavlink` (`LOG_REQUEST_LIST` / `LOG_REQUEST_DATA`) |
| SSH copy | `rsync`/`scp` over SSH (publickey first; optional password via the same askpass pattern as Observation Board). Default user `pi`. |
| Frontend | Vite, React, TypeScript, Tailwind |
| 2D plots + default 3D | `react-plotly.js` / plotly.js |
| Globe / imagery 3D | CesiumJS, loaded only when the operator switches to globe mode |
| 2D map | Plotly `scattermap` with `style: "open-street-map"` (no Mapbox token). Same `T` and markers as 3D |

No Flask, no Dash as the app shell, no Electron.

## 5. Experiment package

Path: `experiments/<slug>/` where `<slug>` is the experiment name sanitized to `[a-zA-Z0-9_-]+`.

```
experiments/Baseball/
  manifest.json
  raw/
    drone_2/Group3RLcat2_log_41_2026-8-25-17-05-30.ulg
    drone_3/Group3RLcat3_log_18_2026-8-25-17-05-26.ulg
    drone_4/Group3RLcat4_log_28_2026-8-25-17-05-24.ulg
  derived/
    sync.json
    drone_2/...parquet
    drone_3/...parquet
    drone_4/...parquet
```

`raw/` is never mutated in place. A new pull adds a new file (timestamp suffix if the name collides). `derived/` is disposable and is rebuilt from `raw/` + `manifest.json`.

### 5.1 `manifest.json`

```json
{
  "version": 1,
  "name": "Baseball",
  "created_at": "2026-08-27T16:00:00Z",
  "drones": [
    {
      "id": 2,
      "label": "D2",
      "ssh": { "user": "pi", "host": "192.168.31.30" },
      "mavlink": { "url": "tcp:192.168.31.30:5760" },
      "sources": {
        "ulg": ["raw/drone_2/Group3RLcat2_log_41_2026-8-25-17-05-30.ulg"],
        "system_manager": [],
        "hardware_adapter": []
      }
    }
  ],
  "sync": {
    "mode": "arm",
    "t0_label": "ARM (OB takeoff)",
    "manual_offsets_s": {}
  },
  "ui": {
    "engine3d": "plotly",
    "visible_drone_ids": [2, 3, 4],
    "avatars": { "2": ["ekf_ned", "gps"], "3": ["ekf_ned"], "4": ["ekf_ned", "gps"] },
    "vectors": {},
    "plots": [],
    "markers": [],
    "map_linked": true
  }
}
```

Rules:

- Drone `id` is the physical CatSwarm id (sparse). It is not remapped to 1..N.
- Each `sources.ulg` / `system_manager` / `hardware_adapter` entry is a path string relative to the experiment root.
- Empty source lists are valid (D3 has ulog, no SSH yet).
- `ui` is written on change so reopen restores layout.

### 5.2 Filename → drone id

Default regex: `Group3RLcat(?P<id>\d+)_` and `_d(?P<id>\d+)` (SM CSV `*_system_manager_d2.csv`). If neither matches, the API returns `needs_id` and the UI asks. The operator confirmation is stored on that file in the manifest.

## 6. Ingest adapters

All three adapters write under `raw/drone_<id>/` then trigger extract for that drone (other drones stay as-is).

### 6.1 Files

Operator picks files or a directory. Baseball: import `/home/valentin/RL/TESTFLIGHTS/Baseball/` → three ulogs onto ids 2, 3, 4.

Simulation: operator points at local `system_manager/logs/`, `hardware_adapter/logs/`, and/or SITL `.ulg` directories. Same adapter, no SSH.

### 6.2 SSH (Pi)

- Host from `drones[].ssh` (editable in UI). Seed D2 `192.168.31.30`, D4 `192.168.31.152`, user `pi`. D3 has no host until the operator adds it.
- Copy, do not stream. Everything copied from a host is assigned to that drone id (HA filenames often have no id).
  - `~/RL/system_manager/logs/` — prefer files whose names contain `_d<id>`; if none match, copy the newest `*system_manager*.csv` and `*control_logs*` the operator confirms.
  - `~/RL/hardware_adapter/logs/` — `*_adapter_diag.log` and `*_mavlink.txt` from that Pi.
- Optional `drones[].ssh.password` lives only in the gitignored experiment folder; never write it to logs or API error strings.
- If the remote dir is empty or the host is unreachable: that adapter fails for that drone; the experiment remains open.
- Do not delete local raw files on failure.

### 6.3 MAVLink `.ulg`

- Default URL: `tcp:<host>:5760` (Pi `mavlink-server`).
- Optional: `udp:<host>:14540` or a local serial device (`/dev/ttyUSB0`, baud 57600). Serial and UDP are operator-selected; they are not used while a live Hardware Adapter sticky partner must stay exclusive on that port.
- Protocol: list onboard logs, download selected (default: latest) into `raw/drone_<id>/`.
- Post-flight only. Analysis must not send `COMMAND_LONG` arm/disarm or mode changes.

## 7. Extract (`derived/`)

For each present source:

| Source | Extractor | Output |
|---|---|---|
| `.ulg` | `pyulog` | One parquet per topic. Always extract: `vehicle_local_position`, `vehicle_gps_position` (fallback `vehicle_global_position` if the GPS topic is absent — typical SITL), `vehicle_attitude`, `vehicle_status`, and `home_position` when the ulog contains it. Other topics extracted on demand when first plotted. |
| SM CSV | pandas/`pyarrow` | `sm_system_manager.parquet` with original columns. Control CSVs stored the same way. |
| HA text | line parser | `ha_diag.parquet` / `ha_mavlink.parquet` when timestamps are recoverable; otherwise keep raw only and omit from the channel picker. |

Parquet time column is native source time (`timestamp` in PX4 microseconds for ulog; SM `timestamp` and `local_ts` kept as separate columns). Experiment time `T` is not written into every row; it is applied via `derived/sync.json`.

## 8. Time synchronization

Clocks: PX4 time starts at FC boot (battery). Pi `local_ts` starts with the companion process. Drones were not powered at the same instant. Observation Board takeoff ARM reaches all mission drones at the same wall-clock moment.

**Per drone (FC):** `t_arm_ulog_us` = timestamp of the first sample where `vehicle_status` becomes armed (`arming_state` armed; if that field is absent, `actuator_armed.armed == 1`).  
**Per drone (Pi):** `t_arm_sm` = `local_ts` of the first SM row whose state is `S4_TAKEOFF` (numeric `4` or name `S4_TAKEOFF`). If that row does not exist, SM is `synced: false` for that drone; ulog ARM is still used. Do not infer ARM from OFFBOARD mode alone.

**Experiment time (ulog):** `T = (t_us - t_arm_ulog_us) / 1e6`.  
**Experiment time (SM):** `T = local_ts - t_arm_sm`.  
Every synced source therefore has ARM at `T = 0`. Do not mix SM `timestamp` (PX4-like) into `T`; keep it as a plottable column only.

If ulog ARM is missing: that drone is `synced: false` and uses `T = t_us/1e6 - t_first_sample` (starts at 0, not aligned to other drones’ ARM). A banner lists unsynced ids. `manifest.sync.manual_offsets_s` is added after this mapping.

`derived/sync.json` example:

```json
{
  "mode": "arm",
  "drones": {
    "2": {
      "ulog_arm_us": 123456789,
      "sm_arm_local_ts": 11412.04,
      "synced": true,
      "note": ""
    },
    "3": {
      "ulog_arm_us": 987654321,
      "sm_arm_local_ts": null,
      "synced": true,
      "note": "ulog only"
    }
  }
}
```

Rebuild `sync.json` whenever raw files for a drone change.

## 9. World frame (3D)

Default Plotly 3D uses **ENU metres**, Z up.

- Origin: mean LLA of each drone’s GPS position at `T = 0` (ARM). If a drone has no GPS, omit it from the origin average.
- GPS avatar: LLA → ENU relative to that origin.
- EKF NED avatar: `vehicle_local_position.{x,y,z}` is NED metres in the drone EKF frame. Convert via `home_position` (or GPS at ARM) to LLA, then to the same ENU. If home/GPS is missing, plot that EKF avatar in a local NED→ENU converted frame whose origin is (0,0,0) and show a “local frame” badge (not mixed with GPS-world drones as if they shared a origin).
- SM `pos_ned` / `lla` / `filt_lla`: same rules (LLA to ENU; NED via SM origin/`initialPos_lla` when present in the CSV or a sidecar, else local-frame badge).

Attitude: body triad from `vehicle_attitude` quaternion (FRD in NED). Draw three unit axes at the avatar position, coloured RGB = body x/y/z. No aircraft mesh in v1.

## 10. Query API

Base path `/api`. JSON only (except file upload).

| Method | Path | Role |
|---|---|---|
| GET | `/health` | `{ok: true}` |
| GET | `/experiments` | List `{slug, name, drone_ids, missing}` |
| POST | `/experiments` | Body `{name}` → create folder + empty manifest |
| GET | `/experiments/{slug}` | Manifest + sync summary + source presence |
| PATCH | `/experiments/{slug}/manifest` | Merge `ui` and drone host fields |
| POST | `/experiments/{slug}/import` | JSON `{paths: string[]}` for directories the backend can read (e.g. Baseball). Multipart file upload writes into `raw/` when the browser cannot send a server path. |
| POST | `/experiments/{slug}/pull` | Body `{drone_id, adapters: ["ssh"|"mavlink"]}` |
| POST | `/experiments/{slug}/rebuild` | Re-extract + re-sync |
| GET | `/experiments/{slug}/topics` | Channel tree: drone → source → topic → fields |
| GET | `/experiments/{slug}/pose` | Query `t` (seconds). Returns per visible drone: avatars, attitude, optional vectors |
| GET | `/experiments/{slug}/series` | Query `channels` (repeatable), optional `t0`,`t1`. Returns `{t, y}` in experiment time |
| PATCH | `/experiments/{slug}/markers` | Replace marker list (LLA + label) |

`pose` interpolates position linearly and attitude by slerp between surrounding samples. If `t` is outside a drone’s data, that drone is still listed with `present: false` (HTTP 200).

`GET /pose?t=` body:

```json
{
  "t": 1.23,
  "origin": {"lat": 32.08, "lon": 34.78, "alt_m": 50.0},
  "drones": {
    "2": {
      "present": true,
      "synced": true,
      "attitude_q_xyzw": [0, 0, 0, 1],
      "avatars": {
        "ekf_ned": {"e": 1.0, "n": 2.0, "u": 3.0},
        "gps": {"e": 1.1, "n": 2.1, "u": 2.9}
      },
      "vectors": {}
    }
  }
}
```

Channel ids: `{drone_id}.{source}.{topic}.{field}` e.g. `2.ulog.vehicle_local_position.vx`. Source is `ulog` | `sm` | `ha`.

Unknown slug: HTTP 404. Import/pull: HTTP 200 with `{ok: true|false, drones: {"2": {"ok": true}, "4": {"ok": false, "error": "..."}}}`. `ok` is true if at least one drone succeeded. Never put passwords in `error`.

## 11. UI

React + Tailwind. Dark professional chrome consistent with CatSwarm tools, not a clone of Observation Board’s live GS layout.

Layout:

- **Header:** experiment dropdown (switch / new / import folder), rebuild, engine toggle Plotly | Cesium.
- **Left:** drone list (checkbox visibility), per-drone avatar sources, per-drone pull (SSH / MAVLink / files), presence chips (ulg / SM / HA).
- **Center:** 3D view (Plotly or Cesium).
- **Right of 3D:** linked 2D Plotly `scattermap` (GPS tracks + markers + current positions). Collapsible; default open when any drone has GPS.
- **Bottom:** time slider `T`, play, reverse, pause, speed (0.25 / 1 / 2 / 4), numeric `T`.
- **Below:** Plotly 2D panes. “Add plot” → channel picker (ulog or Pi). Shared vertical cursor at `T`.

Playback: `requestAnimationFrame`; `T += direction * speed * dt`. Reverse is negative direction. Loop is off by default.

### 11.1 Avatars and vectors

- Sources: `ekf_ned`, `gps`, `sm_ned`, `sm_lla`. Multiple sources on one drone at once (compare EKF vs GPS).
- Vector: operator binds a 3-vector channel (e.g. `vehicle_local_position.{vx,vy,vz}`) as an arrow on the chosen avatar, ENU, scaled in the UI.

### 11.2 Markers and distances

Click on the 3D ground plane or 2D map to drop a marker (stored as LLA in the manifest). Select two markers → show horizontal (haversine) and 3D ENU distance. Markers are for future surveys; they are not drones.

### 11.3 Globe mode (Cesium)

Switching `engine3d` to `cesium` unmounts Plotly 3D and mounts Cesium in the same pane. Same `pose` API, same `T`, same markers, same body triads. Default imagery: OSM via a URL template (no Cesium Ion token required). Optional Ion token in a local untracked `web/backend/.env` later. 2D Plotly channel plots stay Plotly.

## 12. Error handling

- Partial experiments are first-class. UI shows per-drone source presence; it does not block 3D.
- SSH timeout, bad password, empty remote dir, MAVLink “no logs”: fail that adapter, keep other drones and existing raw files.
- Unknown filename id: `needs_id`, no silent assignment to the wrong drone.
- Missing ARM: `synced: false` for that drone; banner on the 3D view.
- Ulog too large: never send the file to the browser; downsample pose for display (max 20 Hz for trails unless the operator requests full rate for a series).
- Do not log SSH passwords.

## 13. Testing

**Unit tests (every implementation task):** committed fixtures in `web/backend/tests/fixtures/` (tiny synthetic ulog/CSV, not Baseball). Default `pytest -m "not e2e"` must pass without `/home/valentin/RL/TESTFLIGHTS`. A task is not done until its unit tests have been executed and passed (report includes command + output).

Required unit tests:

- Filename `Group3RLcat3_…ulg` → id 3.
- ARM alignment: two drones with different native arm times share `T = 0` at arm.
- Pi/FC offset: SM `local_ts` at S4 and ulog arm map to the same `T`.
- `pose` interpolation between two samples.
- Partial manifest: drones 2,3,4 ulog; empty SM for 3; pose still returns 2 and 4 GPS/EKF.
- Import of a directory with three ulogs creates `raw/drone_{2,3,4}/`.

**End-to-end (after the product is built, mandatory):** tests marked `e2e` use the operator dataset at `/home/valentin/RL/TESTFLIGHTS/Baseball/` (`Group3RLcat2/3/4_*.ulg`). Missing files fail the test (no skip). API E2E: import directory → `raw/drone_{2,3,4}/` → rebuild → `pose` at `T=0` has three present drones (D3 ulog-only, no SSH host) → series for NED `x` on all three. UI E2E (Playwright on `:6473` / API `:6400`): import the same folder, show D2/D3/D4, Plotly 3D, time slider.

## 14. Implementation phases

One product spec; four sequential implementation plans. Each phase is shippable.

**Phase 1 — workstation + local ulog replay**  
Repo, FastAPI/Vite on 6400/6473, experiment package, file import, extract ulog, **ulog ARM `T0`**, Plotly 3D triads + trails, default 2D channels (NED position), scrub/play. Baseball ulogs imported into gitignored `experiments/Baseball/`. Three drones visible without Pi logs.

**Phase 2 — multi-avatar, plots, markers, map**  
EKF+GPS avatars together, channel picker, extra Plotly panes, ground markers and distances, linked 2D `scattermap`, persist `ui` in manifest.

**Phase 3 — remote + Pi + sim paths**  
SSH copy, MAVLink download, SM/HA extract, Pi↔FC ARM sync (`local_ts` vs ulog), simulation local directories, D2/D4 hosts prefilled.

**Phase 4 — globe**  
Cesium 3D engine switch, OSM imagery, same cursor/markers.

## 15. Documentation and git

- Root `README.md` (idea, architecture, reading order) and `UPDATES.md` (newest on top, `ver.subver.subsubver`). First release: `0.1.0`.
- Agents read README then UPDATES before changing behavior.
- Own git repository in `/home/valentin/RL/CatSwarm/ExperimentAnalysis`. Adding it as a CatSwarm submodule is an operator step after the first commit; it is not required to run the app.
- `experiments/` is gitignored. Test fixtures are not.

## 16. Baseball acceptance (operator)

Given only the three files in `/home/valentin/RL/TESTFLIGHTS/Baseball/`:

- Experiment opens with drones 2, 3, 4.
- 3D shows three body triads after extract + ARM sync.
- D3 has no SSH target; reconstruction still runs.
- Later: pull D2 from `pi@192.168.31.30` and D4 from `pi@192.168.31.152` appends SM/HA without replacing ulogs; rebuild updates plots.
- D3 Pi data can be attached the same way when the airframe exists.
