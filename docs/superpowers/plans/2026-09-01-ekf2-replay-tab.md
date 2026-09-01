# EKF2 Replay Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Replay tab that runs EKF2 system-wide replay on a physical drone’s ulog in the open experiment and appends `Di_rj` rows for Analysis/Sources, with no runtime dependency on PX4Replay.

**Architecture:** Copy PX4Replay modules into `web/backend/ea/replay/` and `web/frontend/src/replay/`, adapt container mount to ExperimentAnalysis, attach success as string drone ids `{i}_r{j}` in the open experiment, rebuild in-process. Same FastAPI `:6400` and Vite `:6473`.

**Tech Stack:** Python 3.11+, FastAPI, pytest, pyulog; React 19, TypeScript, Vitest, Testing Library, Tailwind, react-plotly.js. Docker exec into `dockerfiles_firm-px4-noetic-firm-1` (mocked in unit tests).

**Spec:** `docs/superpowers/specs/2026-09-01-ekf2-replay-tab-design.md`

## Global Constraints

- No import, HTTP, subprocess, or path dependency on `/home/valentin/RL/PX4Replay` in production code. Reading that tree **while implementing** (to copy files) is allowed; copied modules must live under this repo.
- Do not bind ports 6500 or 6573. Replay API is on existing `:6400`. Forbidden ports unchanged: 5000, 6173, 3001, 5173.
- Replay ids are strings `{i}_r{j}` (example `2_r1`). Physical ids stay integers 1–9. Channel ids stay `{drone}.{source}.{topic}.{field}` (drone segment may contain `_` but not `.`).
- `j` is monotonic per parent; never reuse after delete. No replay-of-replay.
- One replay job at a time; second start → HTTP 409.
- Container ulog prefix: `/home/valentin/ExperimentAnalysis/` (not `/home/valentin/PX4Replay`). Docker container name: `dockerfiles_firm-px4-noetic-firm-1`. `make px4_sitl none` only. Abort if `matek` appears in argv.
- Success appends to the **open** experiment. Do not create a new experiment folder. Do not HTTP POST `/api/experiments` or GET `:6400` health for rebuild — call `rebuild(slug)` in-process.
- Empty `replay_params.txt` overrides → zero-byte file. Diffs only (`NAME value` lines).
- Tabs change only by click. Do not auto-switch to Analysis after replay.
- TDD: failing test first, watch it fail, then minimal code. Record RED/GREEN in the implementer report. Default pytest never `docker exec`s.
- Work only in this worktree/branch (`feat/ekf2-replay-tab`). Do not touch the user’s dirty files on `main`.
- Backend tests: `cd web/backend && .venv/bin/python -m pytest` (focused file while iterating; full `not e2e` suite once before commit). Frontend: `cd web/frontend && npx vitest run` similarly.
- Version: `UPDATES.md` HEAD is `0.77.0`; this feature is `0.78.0`. Fold README/UPDATES into the last task.
- Do not create markdown other than README.md / UPDATES.md edits required by the last task (spec/plan already exist).
- Implementers never dispatch subagents or reviewers.

## File map

- Create: `web/backend/ea/replay_id.py`, `web/backend/ea/replay/` package (paths, argv, params, ulog inspect, overlay, results, staging, job, attach)
- Create: `web/frontend/src/replayId.ts`, `web/frontend/src/droneRows.ts`, `web/frontend/src/replay/` (ported UI helpers/components)
- Modify: `ea/store.py`, `ea/rebuild.py`, `ea/pose.py`, `ea/series.py`, `ea/duration.py`, `app.py`
- Modify: `droneColor.ts`, `workspaceTab.ts`, `WorkspaceTabs.tsx`, `DroneList.tsx`, `App.tsx`, `api.ts`
- Test: matching `tests/test_*.py` and `*.test.ts`

---

### Task 1: Replay id helpers

**Files:**
- Create: `web/backend/ea/replay_id.py`
- Create: `web/frontend/src/replayId.ts`
- Test: `web/backend/tests/test_replay_id.py`
- Test: `web/frontend/src/replayId.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces (Python, `ea.replay_id`):
  - `REPLAY_ID_RE` matching `^(?P<i>\d+)_r(?P<j>\d+)$`
  - `is_replay_id(drone_id: object) -> bool`
  - `parent_id(drone_id: object) -> int` (raises `ValueError` if not a replay id)
  - `replay_index(drone_id: object) -> int`
  - `replay_id(parent: int, j: int) -> str` → `f"{parent}_r{j}"`
  - `physical_id(drone_id: object) -> int | None` — int or digit-string → that int; replay → parent; else None
  - `next_replay_index(existing_ids: list, parent: int) -> int` — max j for that parent among existing ids, plus 1; if none, 1
- Produces (TS, same names/behavior; `physicalId` / `isReplayId` / `parentId` / `replayIndex` / `replayId` / `nextReplayIndex` camelCase)

- [ ] **Step 1: Write the failing tests** `web/backend/tests/test_replay_id.py`:

```python
from ea.replay_id import (
    is_replay_id,
    next_replay_index,
    parent_id,
    physical_id,
    replay_id,
    replay_index,
)


def test_parse_replay_id():
    assert is_replay_id("2_r1") is True
    assert is_replay_id(2) is False
    assert is_replay_id("2") is False
    assert parent_id("2_r1") == 2
    assert replay_index("2_r1") == 1
    assert replay_id(2, 3) == "2_r3"


def test_physical_id():
    assert physical_id(2) == 2
    assert physical_id("4") == 4
    assert physical_id("2_r1") == 2
    assert physical_id("x") is None


def test_next_index_monotonic_does_not_reuse():
    assert next_replay_index([2, 3, "2_r1", "2_r2", "3_r1"], 2) == 3
    assert next_replay_index(["2_r1", "2_r3"], 2) == 4
    assert next_replay_index([2], 2) == 1
```

And `web/frontend/src/replayId.test.ts` with the same cases (vitest, node env).

- [ ] **Step 2: Run tests — expect FAIL** (import error / not defined)

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_replay_id.py -v`
Run: `cd web/frontend && npx vitest run src/replayId.test.ts`

- [ ] **Step 3: Implement** both modules. `parent_id`/`replay_index` raise `ValueError` / throw if not a replay id.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat: add Di_rj replay id helpers`

---

### Task 2: Replay color variants

**Files:**
- Modify: `web/frontend/src/droneColor.ts`
- Test: `web/frontend/src/droneColor.test.ts`

**Interfaces:**
- Consumes: `isReplayId`, `parentId`, `replayIndex` from `replayId.ts`; existing `droneColor`
- Produces:
  - `mixHex(hex: string, toward: string, t: number): string` — 6-digit `#rrggbb`; per channel `Math.round(a + (b - a) * t)` clamped 0..255
  - `replayColor(id: string | number): string` — if not replay, `droneColor(id)`; else `t = Math.min(Math.ceil(j / 2) * 0.18, 0.72)`; odd j mix toward `#ffffff`; even j toward `#000000`

- [ ] **Step 1: Write failing tests** (append to `droneColor.test.ts`; keep existing OB tests):

```ts
it("replayColor lightens odd j and darkens even j from the parent hue", () => {
  expect(droneColor("2")).toBe("#008CFF");
  expect(replayColor("2_r1")).toBe("#2EA1FF");
  expect(replayColor("2_r2")).toBe("#0073D1");
  expect(replayColor(2)).toBe("#008CFF");
});
```

`#2EA1FF` = mix `#008CFF` toward white at t=0.18. `#0073D1` = mix toward black at t=0.18.

- [ ] **Step 2: Run `npx vitest run src/droneColor.test.ts` — expect FAIL**

- [ ] **Step 3: Implement `mixHex` and `replayColor`**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat: variant colors for Di_rj`

---

### Task 3: Sources/Analysis row order helper

**Files:**
- Create: `web/frontend/src/droneRows.ts`
- Test: `web/frontend/src/droneRows.test.ts`

**Interfaces:**
- Consumes: `isReplayId`, `parentId`, `replayIndex`, `physicalId` from `replayId.ts`
- Produces: `export function orderedDroneIds(ids: Array<string | number>, physicalCount: number): string[]`
  - Emit physical `"1" .. String(physicalCount)` that appear in `ids` **or** fill 1..count if those physical ids are in ids; actual rule: start from unique physical slots 1..physicalCount (always include each k in 1..physicalCount that is present as a physical id OR that has replay children). Spec UI: fill D1..DN like today, then children.
  - For k in 1..physicalCount: push `String(k)` if that physical id is in the input **or** we are listing slots (match current UI: always D1..DN). Then push replay ids whose parent is k, sorted by j.
  - Input may mix `2` and `"2_r1"`. Output always strings.
  - Ignore replay ids whose parent is outside 1..physicalCount.

- [ ] **Step 1: Write failing tests:**

```ts
import { orderedDroneIds } from "./droneRows";

it("lists each physical slot then its replays by j", () => {
  expect(orderedDroneIds([1, 2, "2_r2", "2_r1", 3, 4], 4)).toEqual([
    "1",
    "2",
    "2_r1",
    "2_r2",
    "3",
    "4",
  ]);
});

it("omits replays whose parent exceeds physicalCount", () => {
  expect(orderedDroneIds([1, 2, "3_r1", "2_r1"], 2)).toEqual(["1", "2", "2_r1"]);
});
```

- [ ] **Step 2: Run vitest — expect FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat: order Di then Di_rj rows`

---

### Task 4: Trim and delete replay drones

**Files:**
- Modify: `web/backend/ea/store.py`
- Test: `web/backend/tests/test_store.py`

**Interfaces:**
- Consumes: `ea.replay_id.physical_id`, `is_replay_id`
- Produces:
  - `set_drone_count` keeps a drone iff `physical_id(d["id"])` is not None and `<= count`. Dropped ids include `3` and `3_r1` when count becomes 2. `rmtree` `raw/drone_{id}`, `derived/drone_{id}`, `derived/ha/drone_{id}` using the **string** id (`2_r1` → `drone_2_r1`).
  - `delete_replay_drone(slug: str, drone_id: object) -> dict` —  / raises `ValueError` if not `is_replay_id`; `FileNotFoundError` if experiment missing; `KeyError` if id not in manifest. Removes manifest row, the three dirs, filters `ui.visible_drone_ids`, `ui.avatars` key, and any `ui.plots[]` whose `channels` list contains a string starting with `f"{drone_id}."`.
- Comparison `d["id"] > count` must not run on mixed str/int (that TypeErrors).

- [ ] **Step 1: Write failing tests** (append to `test_store.py`):

```python
from ea.store import delete_replay_drone, set_drone_count


def test_set_drone_count_drops_replay_children(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("TrimR")
    set_drone_count("TrimR", 3)
    manifest_path = tmp_path / "TrimR" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"].append({
        "id": "2_r1",
        "kind": "replay",
        "parent_id": 2,
        "replay_index": 1,
        "label": "D2_r1",
        "sources": {"ulg": ["raw/drone_2_r1/replayed_r1.ulg"]},
    })
    manifest["drones"].append({
        "id": "3_r1",
        "kind": "replay",
        "parent_id": 3,
        "replay_index": 1,
        "label": "D3_r1",
        "sources": {"ulg": []},
    })
    save_manifest(manifest_path, manifest)
    (tmp_path / "TrimR" / "raw" / "drone_3_r1").mkdir(parents=True)
    (tmp_path / "TrimR" / "raw" / "drone_2_r1").mkdir(parents=True)
    trimmed = set_drone_count("TrimR", 2)
    ids = [d["id"] for d in trimmed["manifest"]["drones"]]
    assert 3 not in ids and "3_r1" not in ids
    assert "2_r1" in ids and 2 in ids
    assert not (tmp_path / "TrimR" / "raw" / "drone_3_r1").exists()
    assert (tmp_path / "TrimR" / "raw" / "drone_2_r1").is_dir()


def test_delete_replay_drone_removes_row(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("DelR")
    set_drone_count("DelR", 2)
    manifest_path = tmp_path / "DelR" / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["drones"].append({
        "id": "2_r1",
        "kind": "replay",
        "parent_id": 2,
        "replay_index": 1,
        "label": "D2_r1",
        "sources": {"ulg": []},
    })
    manifest["ui"]["visible_drone_ids"] = [2, "2_r1"]
    save_manifest(manifest_path, manifest)
    (tmp_path / "DelR" / "raw" / "drone_2_r1").mkdir(parents=True)
    result = delete_replay_drone("DelR", "2_r1")
    ids = [d["id"] for d in result["manifest"]["drones"]]
    assert "2_r1" not in ids
    assert 2 in ids
    assert "2_r1" not in result["manifest"]["ui"]["visible_drone_ids"]
    assert not (tmp_path / "DelR" / "raw" / "drone_2_r1").exists()


def test_delete_physical_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("DelP")
    set_drone_count("DelP", 2)
    with pytest.raises(ValueError, match="replay"):
        delete_replay_drone("DelP", 2)
```

- [ ] **Step 2: Run `pytest tests/test_store.py -v` — expect FAIL** (TypeError or missing `delete_replay_drone`)

- [ ] **Step 3: Implement** using `physical_id` / `is_replay_id`. Keep existing grow/trim tests passing (`d["id"]` for physical stays int).

- [ ] **Step 4: Run `pytest tests/test_store.py -v` — expect PASS**

- [ ] **Step 5: Commit** `feat: trim and delete Di_rj drones`

---

### Task 5: Inherit parent ARM, offset, and physical-only origin

**Files:**
- Modify: `web/backend/ea/rebuild.py`
- Modify: `web/backend/ea/pose.py` — `_compute_origin` and `_manual_offset_s`
- Modify: `web/backend/ea/series.py` — `_manual_offset_s` same inherit
- Modify: `web/backend/ea/duration.py` — `_manual_offset_s` same inherit
- Test: `web/backend/tests/test_rebuild_replay_sync.py` (new)
- Test: `web/backend/tests/test_pose_replay_origin.py` (new)

**Interfaces:**
- Consumes: `ea.replay_id.is_replay_id`, `parent_id`
- Produces: after extract in `rebuild`, if `is_replay_id(drone_id)`, set `per_drone[drone_id]["ulog_arm_us"]` from `per_drone[str(parent)]["ulog_arm_us"]` if that parent key exists (try `str(parent)` and `parent` int). `synced` follows via `write_sync`. `_compute_origin` skips ids where `is_replay_id`. `_manual_offset_s` if replay → look up `str(parent_id(drone_id))` in `manual_offsets_s`.

- [ ] **Step 1: Write failing tests** `test_rebuild_replay_sync.py`:

Use existing ulog fixture pattern from `tests/test_pose.py` (`write_min_ulog` + `vehicle_status` ARM at 5000, `extract_ulog`). Build exp with D2 ulog ARM 5000 and `raw/drone_2_r1/` ulog whose own `arming_state==2` is at 9000. Manifest both ids. `rebuild` via `ea.rebuild.rebuild` with `EA_EXPERIMENTS_DIR`. Assert `sync["drones"]["2_r1"]["ulog_arm_us"] == sync["drones"]["2"]["ulog_arm_us"] == 5000`.

`test_pose_replay_origin.py`: two physical GPS LLA at ARM plus a replay GPS 1 degree away. `_compute_origin` / `pose_at` origin must match physical-only mean (replay GPS must not pull origin). Offset: manifest `manual_offsets_s["2"] = 1.5`; pose/series time for `2_r1` must use 1.5 (if easier, unit-test `_manual_offset_s` by importing it — if it is private, test via `pose_at` T shift like `tests/test_manual_offset.py`).

If `_manual_offset_s` is module-private, duplicate inherit in all three modules (pose, series, duration) — same five lines — rather than a new shared module unless you already touch a shared helper. Prefer adding `ea.sync.manual_offset_s(manifest, drone_id)` used by all three, with tests in `tests/test_sync.py`.

Preferred produce: `ea.sync.manual_offset_s(manifest, drone_id) -> float` with parent inherit; switch pose/series/duration to call it.

- [ ] **Step 2: Run the new tests — expect FAIL**

- [ ] **Step 3: Implement rebuild inherit + origin filter + `manual_offset_s`**

- [ ] **Step 4: Run new tests plus `tests/test_pose.py tests/test_sync.py tests/test_manual_offset.py` — expect PASS**

- [ ] **Step 5: Commit** `feat: Di_rj inherits parent ARM and origin`

---

### Task 6: Vendored replay engine (no Docker)

**Files:**
- Create: `web/backend/ea/replay/__init__.py` (empty or re-exports)
- Create: `web/backend/ea/replay/paths.py`
- Create: `web/backend/ea/replay/replay_argv.py`
- Create: `web/backend/ea/replay/replay_params.py`
- Create: `web/backend/ea/replay/ulog_params.py`
- Create: `web/backend/ea/replay/overlay_series.py`
- Create: `web/backend/ea/replay/results.py`
- Test: `web/backend/tests/test_replay_argv.py`, `test_replay_params.py`, `test_ulog_params.py`, `test_overlay_series.py`, `test_replay_results.py`

Copy logic from `/home/valentin/RL/PX4Replay/web/backend/` counterparts. **Change** `container_replay_root` to `/home/valentin/ExperimentAnalysis`. Do not import PX4Replay.

**Interfaces:**
- `ea.replay.paths`: `host_px4_root()`, `container_px4_root()` → `/home/valentin/PX4-Autopilot`, `container_replay_root()` → `/home/valentin/ExperimentAnalysis`, `host_replay_params_path()`, `DOCKER_CONTAINER = "dockerfiles_firm-px4-noetic-firm-1"`
- `build_replay_argv(container_ulg: str) -> list[str]` — ulg must start with `container_replay_root()+"/"`; same docker exec env as PX4Replay; matek guard
- `write_replay_params(path, overrides)` — empty → `b""`
- `inspect_ulog(path, ulog_factory=None)` — same dict as PX4Replay
- `overlay_series(original, replayed)` — same structure
- `find_newest_replayed` / `collect_results` — copy PX4Replay `results.py`

EA already has `ea.ulog_min.write_min_ulog` — overlay/ulog tests must use **that**, not PX4Replay’s.

- [ ] **Step 1: Write failing tests** adapted from PX4Replay:
  - `test_replay_argv.py`: argv equals docker exec `-w /home/valentin/PX4-Autopilot` `-e replay_mode=ekf2` `-e replay={ulg}` `dockerfiles_firm-px4-noetic-firm-1` `make px4_sitl none` for ulg `/home/valentin/ExperimentAnalysis/experiments/x/replay/work/abc/input.ulg`. `pytest.raises(ValueError)` for `/tmp/log.ulg`. `pytest.raises(RuntimeError, match="matek")` if path contains `matek`.
  - `test_replay_params.py`: empty overrides zero-byte; sorted `NAME value\n`
  - `test_ulog_params.py`: copy PX4Replay `test_ulog_params.py` imports to `ea.replay.ulog_params` and `ea.ulog_min`
  - `test_overlay_series.py`: copy PX4Replay tests, fix imports
  - `test_replay_results.py`: copy PX4Replay `test_results.py` if present, else assert `collect_results` writes `px4.log` and newest `*_replayed.ulg`

- [ ] **Step 2: Run those pytest files — expect FAIL**

- [ ] **Step 3: Copy/adapt implementation into `ea/replay/`**

- [ ] **Step 4: Run those tests — expect PASS**

- [ ] **Step 5: Commit** `feat: vendor EKF2 replay engine under ea.replay`

---

### Task 7: Stage inspect under the experiment folder

**Files:**
- Create: `web/backend/ea/replay/work_staging.py`
- Test: `web/backend/tests/test_replay_staging.py`

**Interfaces:**
- Consumes: `inspect_ulog` from `ea.replay.ulog_params`
- Produces:
  - `container_ulg_path(slug: str, run_id: str) -> str` → `/home/valentin/ExperimentAnalysis/experiments/{slug}/replay/work/{run_id}/input.ulg`
  - `inspect_and_stage(host_path: Path, work_root: Path, slug: str, ulog_factory=None) -> dict` — parse first; on success `run_id` 12 hex chars, copy to `work_root / run_id / input.ulg`; include `container_ulg` via `container_ulg_path(slug, run_id)`. Parse fail: no new dir under `work_root`, raise `ValueError`.

- [ ] **Step 1: Write failing tests** (from PX4Replay `test_work_staging.py`, slug `"Exp"`):

```python
from pathlib import Path
from ea.replay.work_staging import inspect_and_stage, container_ulg_path
from ea.ulog_min import write_min_ulog


def test_container_path_uses_experiment_mount():
    assert container_ulg_path("Exp", "abc") == (
        "/home/valentin/ExperimentAnalysis/experiments/Exp/replay/work/abc/input.ulg"
    )


def test_stage_after_ok(tmp_path):
    src = tmp_path / "src.ulg"
    write_min_ulog(src, {"vehicle_local_position": [{"timestamp": 0, "x": 0.0, "y": 0.0, "z": 0.0}]})
    work = tmp_path / "work"
    work.mkdir()
    info = inspect_and_stage(src, work, "Exp")
    assert len(info["run_id"]) == 12
    assert Path(info["host_ulg"]).name == "input.ulg"
    assert info["container_ulg"] == container_ulg_path("Exp", info["run_id"])


def test_bad_file_creates_no_work(tmp_path):
    src = tmp_path / "bad.ulg"
    src.write_bytes(b"nope")
    work = tmp_path / "work"
    work.mkdir()
    import pytest
    with pytest.raises(ValueError):
        inspect_and_stage(src, work, "Exp")
    assert list(work.iterdir()) == []
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** `feat: stage replay ulogs under the experiment`

---

### Task 8: Attach Di_rj instead of a new experiment

**Files:**
- Create: `web/backend/ea/replay/attach.py`
- Create: `web/backend/ea/replay/replay_job.py`
- Test: `web/backend/tests/test_replay_attach.py`
- Test: `web/backend/tests/test_replay_job.py`

**Interfaces:**
- Consumes: Task 1 ids, Task 6 argv/params/results, Task 7 staging paths, `ea.store.open_experiment`, `ea.manifest.save_manifest`, `ea.rebuild.rebuild`
- Produces:
  - `attach_replay(slug, parent_id, run_id, original_ulg: Path, replayed_ulg: Path, overrides: dict) -> dict` with `replay_id` e.g. `"2_r1"`. Copies to `raw/drone_{replay_id}/replayed_r{j}.ulg`, appends manifest entry per spec, sets `ui.visible_drone_ids` to include the new id (keep existing). Does **not** create a new slug directory. Returns `{replay_id, j}`.
  - `start_replay(run_id, overrides, *, slug, parent_id, work_root, results_root, sitl_log_root, replay_params_path, original_ulg, container_ulg, runner=None, rebuild=None, popen_factory=None, preflight=None, claimed=False)` — same lock/busy/stop as PX4Replay `replay_job.py` but on success call `attach_replay` then `rebuild(slug)` (injectable). Job dict keys: `status`, `results_dir`, `replayed_ulg`, `replay_id` (not `ea_slug`), `error`, `pid`. Stop: `replay_id` None, no attach. Non-zero or no `*_replayed.ulg`: failed, no attach. Preflight default checks container + `/home/valentin/ExperimentAnalysis` dir inside container (`docker exec … test -d`). Copy `claim_busy` / `request_stop` / `get_job` / `reset_jobs` / testing helpers.

- [ ] **Step 1: Write failing tests**

`test_replay_attach.py`: tmp experiment with D2; `attach_replay("S", 2, "abc", orig, replayed, {"EKF2_X": 1})` → `raw/drone_2_r1/replayed_r1.ulg` exists, manifest id `"2_r1"`, `kind=="replay"`, `parent_id==2`, second call → `"2_r2"`.

`test_replay_job.py` adapted from PX4Replay:
- success: runner returncode 0, sitl has `x_replayed.ulg`, `attach` into tmp experiments dir already containing slug `S` with drone 2; `job["replay_id"]=="2_r1"`; `job` has **no** new folder besides `S`; `rebuild` injectable called with `"S"`; params file diffs; `is_busy()` False after.
- nonzero: no `raw/drone_2_r1`
- stop: no attach
- second `claim_busy` / start while busy → `BusyError`
- container_ulg passed to `build_replay_argv` must be under ExperimentAnalysis

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement attach + job** (copy PX4Replay job control, replace `export_experiment`)

- [ ] **Step 4: Run those tests — expect PASS**

- [ ] **Step 5: Commit** `feat: attach replayed ulog as Di_rj`

---

### Task 9: Replay HTTP API

**Files:**
- Modify: `web/backend/app.py`
- Test: `web/backend/tests/test_api_replay.py`

**Interfaces:**
- Consumes: store, staging, job, overlay_series, `delete_replay_drone`
- Produces routes from the spec. Resolve the physical drone’s ulog from `sources.ulg[0]` under the experiment path. `work_root = exp/replay/work`, `results_root = exp/replay/results`. Inspect 404 unknown slug; 400 replay id or missing ulog file. Start 409 if busy. GET/stop/series 404 unknown `run_id`. DELETE physical → 400; unknown slug → 404.

Use FastAPI TestClient like `tests/test_api_experiments.py`. Monkeypatch `start_replay` / `inspect_and_stage` where needed so tests never docker. For inspect, a real min ulog on disk is fine.

- [ ] **Step 1: Write failing tests** covering inspect 200 + run_id, inspect 400 on `"2_r1"`, inspect 404 bad slug, POST replay 200, POST replay 409 when `testing_set_busy(True)`, GET job, DELETE `2_r1` 200 and physical 400.

- [ ] **Step 2: Run `pytest tests/test_api_replay.py -v` — expect FAIL**

- [ ] **Step 3: Wire routes in `app.py`**. Guard existing pull/import/ssh/mavlink: if `is_replay_id(body.drone_id)` → 400 (add one test on POST import or pull).

- [ ] **Step 4: Run `test_api_replay.py` plus `test_api_experiments.py` — expect PASS**

- [ ] **Step 5: Commit** `feat: add experiment replay HTTP API`

---

### Task 10: Replay workspace tab

**Files:**
- Modify: `web/frontend/src/workspaceTab.ts`
- Modify: `web/frontend/src/components/WorkspaceTabs.tsx`
- Modify: `web/frontend/src/components/WorkspaceTabs.test.tsx`
- Modify: `web/frontend/src/workspaceTab.test.ts`
- Modify: `web/frontend/src/App.tsx`
- Modify: `web/frontend/src/App.test.tsx`

**Interfaces:**
- `WorkspaceTab = "sources" | "analysis" | "replay"`
- `tabLabel("replay") === "Replay"`
- `DEFAULT_TAB` still `"sources"`
- `tabAfterAction` still returns `current`
- Tabs array includes replay. App renders `role="tabpanel"` `aria-labelledby="workspace-tab-replay"`. Empty state when no slug: text containing `Open an experiment` (same idea as Analysis). Do not port PX4Replay SkinToggle. Placeholder panel is enough; full Replay UI is Task 11.

- [ ] **Step 1: Write failing tests** in `workspaceTab.test.ts` (three labels) and `WorkspaceTabs.test.tsx` (Replay tab present, click notifies `"replay"`). App.test: click Replay shows tabpanel named /replay/i.

- [ ] **Step 2: Run those vitest files — expect FAIL**

- [ ] **Step 3: Implement tab type + App panel stub**

- [ ] **Step 4: Run those tests — expect PASS**

- [ ] **Step 5: Commit** `feat: add Replay workspace tab`

---

### Task 11: Replay tab inspect / params / run / overlays

**Files:**
- Create: `web/frontend/src/replay/` — copy from `/home/valentin/RL/PX4Replay/web/frontend/src/` the modules `paramGroup.ts`, `paramDiffs.ts`, `paramFilter.ts`, `overlayPlots.ts`, `sessionPrefs.ts` (key `ea-replay-session`) and components `ParamTable`, `RunPanel`, `OverlayPlots` (not LogStep Browse). Adapt fetch to `../api` helpers you add.
- Modify: `web/frontend/src/api.ts` + `api.test.ts` — `inspectReplay`, `startReplay`, `getReplay`, `stopReplay`, `getReplaySeries` against `/api/experiments/${slug}/replay/...`
- Create: `web/frontend/src/components/ReplayTab.tsx` + `ReplayTab.test.tsx`
- Modify: `App.tsx` to mount `ReplayTab` with `slug` and `manifest`

**Interfaces:**
- Physical drones with `sources.ulg` length > 0 appear in a `<select aria-label="Replay drone">` as `D{id}`.
- Changing select calls inspect POST `{drone_id}`.
- ParamTable / RunPanel / OverlayPlots behavior matches PX4Replay (filter default EKF2, 500ms poll, overlays when `status==="success"`). No experiment name field. Run POST body `{run_id, drone_id, overrides}`.
- Copy PX4Replay unit tests for paramGroup, paramDiffs, paramFilter, overlayPlots into `web/frontend/src/replay/*.test.ts` (fix imports). ReplayTab.test: with a stubbed `inspectReplay`, selecting D2 calls inspect.

- [ ] **Step 1: Write failing tests** (api URLs + ReplayTab select + copied helper tests)

- [ ] **Step 2: Run focused vitest — expect FAIL**

- [ ] **Step 3: Port UI and wire api.** Use existing EA skin (`data-skin` / plot theme if OverlayPlots needs it — match PX4Replay `plotTheme` using `document.documentElement.dataset.skin` or the same zinc tokens EA already has). Do not add a second localStorage skin key.

- [ ] **Step 4: Run frontend vitest for replay + api + ReplayTab — expect PASS**

- [ ] **Step 5: Commit** `feat: Replay tab inspect, params, run, overlays`

---

### Task 12: Di_rj rows, delete, docs

**Files:**
- Modify: `web/frontend/src/components/DroneList.tsx` + `DroneList.test.tsx` (create test file if missing)
- Modify: `web/frontend/src/api.ts` — `deleteReplayDrone(slug, id)`
- Modify: `web/frontend/e2e/baseball.spec.ts` — assert Replay tab exists (do not run Docker)
- Modify: `README.md`, `UPDATES.md` (`0.78.0`)

**Interfaces:**
- DroneList uses `orderedDroneIds` + `replayColor` for replay rows. Physical rows unchanged. Replay rows: indent, no Import/SSH/MAVLink/host, ULG summary, Delete button `aria-label="Delete D2_r1"`; `window.confirm` before DELETE. Analysis variant: visibility + pose checkboxes for replay ids; hiding parent does not hide child.
- README: third tab, `Di_rj`, compose bind `/home/valentin/RL/CatSwarm/ExperimentAnalysis:/home/valentin/ExperimentAnalysis`, recreate container, no 6500/6573. Architecture still two processes. Name UPDATES.md as mandatory reading (keep).
- UPDATES 0.78.0 newest on top.

- [ ] **Step 1: Write failing tests** for DroneList: render ids `[2, "2_r1"]` with physicalCount 2 → see `D2` and `D2_r1`; replay row has Delete, not SSH; Analysis row has checkbox `D2_r1`. api.test DELETE URL. baseball.spec `getByRole("tab", { name: "Replay" })`.

- [ ] **Step 2: Run those tests — expect FAIL**

- [ ] **Step 3: Implement list UI + docs**

- [ ] **Step 4: Run frontend vitest (full) and backend pytest `-m "not e2e"` — expect PASS**

- [ ] **Step 5: Commit** `feat: show and delete Di_rj rows; document Replay tab`
