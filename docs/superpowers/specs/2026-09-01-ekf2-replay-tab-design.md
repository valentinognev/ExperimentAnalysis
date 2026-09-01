# EKF2 Replay tab — design

Date: 2026-09-01
Status: approved (in-chat 2026-09-01)

## Goal

Port PX4Replay into ExperimentAnalysis as a third workspace tab (**Replay**), with **no runtime, import, HTTP, port, or path dependency** on `/home/valentin/RL/PX4Replay`. Replay is tied to the **open experiment**. A successful EKF2 system-wide replay of physical drone `i` appends a first-class drone **`{i}_r{j}`** (UI label `Di_rj`) so Sources and Analysis can compare original vs one or more replays.

## Non-goals

- Editing or depending on the PX4Replay git tree after copy
- Binding 6500 / 6573 or starting a second FastAPI/Vite process
- Creating a new experiment folder (old D1 original / D2 replayed export)
- Parallel replay jobs
- `replay_params_dynamic.txt`, non-EKF2 / full system-wide replay
- Replay-of-replay (input is always a physical drone’s ulog)
- Live GS commands, Matek `make`, touching `build/matek_h743-slim_default`
- Docker SITL in default pytest / Playwright Baseball e2e

## Architecture

Same two processes as today (`127.0.0.1:6400` API, `127.0.0.1:6473` UI). Replay HTTP lives on the existing FastAPI app. Frontend is an extra tab in the existing React app. Night/Day stays the existing header control (`ea-skin`).

Code is **copied and adapted** into this repo:

| From PX4Replay | Into ExperimentAnalysis |
|---|---|
| `web/backend/{paths,replay_argv,replay_params,ulog_params,overlay_series,results,work_staging,replay_job}.py` | `web/backend/ea/replay/` (package; EA `paths.py` already exists — replay constants live in `ea/replay/paths.py`) |
| Frontend param/overlay helpers and components | `web/frontend/src/replay/` |

Implementers may **read** PX4Replay on disk to copy behavior. The running app must not import it, subprocess it, or HTTP it.

### Docker

Still `docker exec` into `dockerfiles_firm-px4-noetic-firm-1`. PX4 host tree unchanged: `/home/valentin/Projects/GambitonBiut/docker_firm/PX4-Autopilot` ↔ `/home/valentin/PX4-Autopilot`. Command: `make px4_sitl none` with `replay_mode=ekf2` and `replay=<container ulg>`. Rewrite `{host PX4}/build/px4_sitl_default_replay/rootfs/replay_params.txt` (diffs only; empty overrides → zero-byte file). Abort argv if `matek` appears. Stop = SIGTERM of that process group only.

Compose bind (operator recreates the service; this repo does not edit `compose.yaml`):

```yaml
- /home/valentin/RL/CatSwarm/ExperimentAnalysis:/home/valentin/ExperimentAnalysis
```

Replace any `/home/valentin/PX4Replay` mount. Container ulog:

`/home/valentin/ExperimentAnalysis/experiments/<slug>/replay/work/<run_id>/input.ulg`

Pre-flight: container running; `/home/valentin/ExperimentAnalysis` exists **inside** the container. Else fail with an operator message to recreate compose. Tests inject `runner` / `popen_factory` / `preflight`; default pytest never `docker exec`s.

## Data model

Physical drones keep integer `id` (1–9) and folders `raw/drone_2/`. Replay identity is the string **`"{i}_r{j}"`**. Folders: `raw/drone_2_r1/`, `derived/drone_2_r1/`. Channel ids: `2_r1.ulog.{topic}.{field}` (no extra dots in the drone segment; existing `split(".", maxsplit=2)` stays valid).

Pattern: `^(?P<i>\d+)_r(?P<j>\d+)$`. Helpers (Python + TypeScript): `is_replay_id`, `parent_id`, `replay_index`, `replay_id(i, j)`, `next_replay_index(existing_ids, parent_i)`.

`j` is monotonic per parent: first is `2_r1`, next `2_r2`. Deleting `2_r1` does not reuse `1`. Replay tab lists only physical drones that have a ulog.

Manifest drone (replay):

```json
{
  "id": "2_r1",
  "kind": "replay",
  "parent_id": 2,
  "replay_index": 1,
  "label": "D2_r1",
  "sources": {
    "ulg": ["raw/drone_2_r1/replayed_r1.ulg"],
    "ulg_origin": "<replayed file>",
    "system_manager": [],
    "hardware_adapter": []
  },
  "replay": { "run_id": "…", "overrides": {} }
}
```

Basename `replayed_r{j}.ulg` — never `Group3RLcatN_`. No SM/HA. Import / SSH / MAVLink / POST add-drone on a replay id → 400. Physical ids stay integers in JSON; APIs stringify everywhere.

**Drone #** counts physical slots only. Lowering N drops physical ids `> N` and every `{i}_r*` with `i > N` (raw + derived + ha + manifest + `visible_drone_ids`). `set_drone_count` must not compare `"2_r1" > 4` as Python strings.

**Delete** `DELETE /api/experiments/{slug}/drones/{drone_id}`: replay ids only. Removes manifest row, `raw/drone_{id}/`, `derived/drone_{id}/`, `derived/ha/drone_{id}/`, that id from `ui.visible_drone_ids` / `ui.avatars` / plot channel lists that start with `{id}.`. 400 on physical id. Confirm in UI before delete.

**Time / world:** after extract, a replay does not keep its own ARM. `sync.json` sets `ulog_arm_us` (and `synced`) from the **parent**. Manual offset for a replay is the parent’s `sync.manual_offsets_s[str(parent)]` (ignore a key named `2_r1`). Pose origin = mean GPS LLA at T=0 of **physical** drones only. `synced` for `2_r1` follows D2.

**Color:** `droneColor` for physical ids is unchanged (Observation Board). `replayColor(id)`: parse parent + j; start from `droneColor(parent)`; `t = min(ceil(j/2) * 0.18, 0.72)`; odd j mix toward `#ffffff`, even j mix toward `#000000`; per-channel `round(a + (b-a)*t)` to hex. Analysis/Sources/plots use `replayColor` when `isReplayId`.

**Staging:** `experiments/<slug>/replay/work/<run_id>/` and `…/results/<run_id>/` (gitignored via `experiments/`). Success copies into `raw/drone_{i}_r{j}/` then in-process `rebuild(slug)`. No HTTP to `:6400`. Failure: `px4.log` under results only; no drone row. Stop skips collect.

## Replay tab and API

Tabs: **Sources | Analysis | Replay**. Click-only (`tabAfterAction` unchanged). Empty Replay (no slug) uses the same prompt pattern as Analysis. No PX4Replay skin toggle. No Browse; no new-experiment name field.

Tab contents:

1. Select physical Di that has a ulog (label + filename).
2. Selecting Di inspects that drone’s manifest ulog (file in `raw/drone_i/`). Auto-inspect on select.
3. Param table: default filter `EKF2`, prefix groups, diffs-only overrides, Reset (PX4Replay behavior).
4. Run: Replay / Stop / 500ms GET poll. Disabled without inspect, while busy, or while non-terminal.
5. Overlay plots from original + this run’s replayed ulog (attitude q, local x/y/z, innovations if present).

One replay globally (409 if busy).

| Method | Path | Role |
|---|---|---|
| POST | `/api/experiments/{slug}/replay/inspect` | `{drone_id}` physical + ulog → params, topics, duration, `run_id`, warnings; copy to work |
| POST | `/api/experiments/{slug}/replay` | `{run_id, drone_id, overrides}` start; 200 `{ok, run_id}`; 409 busy |
| GET | `/api/experiments/{slug}/replay/{run_id}` | job (`status`, `error`, `replay_id` when success) |
| POST | `/api/experiments/{slug}/replay/{run_id}/stop` | SIGTERM that job’s process group |
| GET | `/api/experiments/{slug}/replay/{run_id}/series` | overlay series |
| DELETE | `/api/experiments/{slug}/drones/{drone_id}` | replay ids only |

Unknown slug → 404. Replay id or missing ulog on inspect/start → 400. Success: next j, copy `replayed_r{j}.ulg`, append manifest, rebuild, job `replay_id: "2_r1"`. Default new replay visible.

## Sources and Analysis UI

Order: each physical slot 1..N, then that drone’s replays by j, then the next physical. Example: `D1`, `D2`, `D2_r1`, `D2_r2`, `D3`, `D4`. Label `D{id}` already yields `D2_r1`. Replay rows indented. Empty physical (no ulog) has no children. Replay rows do not change Drone #.

Sources physical: unchanged. Sources replay: variant color; ULG name + stamp; SM/HA —; no host; no Import/SSH/MAVLink; **Delete** with `aria-label="Delete D2_r1"` and confirm.

Analysis: same order; visibility checkbox per row (replays default on); pose-source checkboxes as today. Hiding D2 does not hide D2_r1. Legends `D2_r1 ekf`. Existing dash collision still applies.

Stay on Replay after success. Unsynced banner: replay uses parent `synced`; do not list replay ids separately if the parent is already listed.

## Tests

Unit tests for: id parse / next j, color, row order, DELETE 400 on physical, inspect 400 on replay, ARM inherit, origin ignores replay GPS, argv mount path, staging, job attach (no new experiment slug), tabs, delete control. Vitest for Replay tab picker. Playwright Baseball: Replay tab exists; no Docker SITL in default e2e.

## Operator compose note

README must document the bind mount and that the `px4-noetic-firm` service must be **recreated** after the volume change.
