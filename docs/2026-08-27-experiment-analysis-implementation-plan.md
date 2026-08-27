# ExperimentAnalysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Spec: `docs/2026-08-27-experiment-analysis-design.md` (read before Task 1). Work directory: `/home/valentin/RL/CatSwarm/ExperimentAnalysis`.

**Goal:** Build ExperimentAnalysis: a laptop-local FastAPI + React app that reconstructs CatSwarm flights/simulations from PX4 `.ulg` and Pi logs, with ARM-synced 3D/2D Plotly replay and optional Cesium globe.

**Architecture:** Experiments are gitignored folders (`manifest.json` + `raw/` + `derived/`). The backend extracts parquet, computes ARM `T0`, and serves `/api/pose` and `/api/series`. The browser holds the time cursor and never parses ulog. Ports **6400** (API) and **6473** (UI) must not collide with Observation Board or GUI.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, pyulog, pyarrow, pandas, pymavlink, pytest; Vite, React, TypeScript, Tailwind 4, react-plotly.js, CesiumJS (phase 4, lazy).

## Global Constraints

- Root: `/home/valentin/RL/CatSwarm/ExperimentAnalysis` (own git). Do not modify ObservationBoard, GUI, hardware_adapter, or system_manager.
- Backend bind `127.0.0.1:6400`. Frontend bind `127.0.0.1:6473`. Never 5000, 6173, 3001, 5173.
- Tmux session/window names: `experiment_analysis` / `ExperimentAnalysis`. Never `catswarm_gui`, never kill OB/GUI ports.
- Experiments live in `experiments/<slug>/` (gitignored). Unit-test fixtures in `web/backend/tests/fixtures/` (committed, tiny, synthetic). Default `pytest` (`-m "not e2e"`) must pass without `/home/valentin/RL/TESTFLIGHTS`.
- **Per-task unit tests (mandatory):** Task N is not done until its listed test file(s) are run and pass. The implementer report must include the exact command and full output. The reviewer rejects the task if tests were skipped, not run, or the report has no output. After implementation, re-run that task's tests (not the whole e2e suite).
- **Final E2E (mandatory, after Task 43):** Tasks 44–45 run against the operator Baseball ulogs at `/home/valentin/RL/TESTFLIGHTS/Baseball/`. Missing files = FAIL (do not skip). These tests are `@pytest.mark.e2e` / Playwright and are not part of per-task unit gates.
- Slug: `[a-zA-Z0-9_-]+`. Drone ids are physical and sparse (2, 3, 4), never remapped to 1..N.
- Channel ids: `{drone_id}.{source}.{topic}.{field}` with source `ulog` | `sm` | `ha`.
- Ulog ARM: first `vehicle_status.arming_state == 2` (PX4 `ARMING_STATE_ARMED`); else `actuator_armed.armed == 1`.
- SM ARM: first row state `S4_TAKEOFF` or numeric `4`. Do not infer ARM from OFFBOARD alone.
- Ulog experiment time: `T = (t_us - t_arm_ulog_us) / 1e6`. SM: `T = local_ts - t_arm_sm`. Do not use SM `timestamp` for `T`.
- World frame: ENU metres, Z up. Origin = mean GPS LLA at `T=0`. NED→ENU: `e=ned.y`, `n=ned.x`, `u=-ned.z`. WGS84 `A=6378137` (same as Observation Board `geo.ts`).
- `raw/` append-only. Failed pull must not delete existing raw files. Never log or return SSH passwords.
- No Flask, no Dash shell, no Electron, no live GS commands, no `COMMAND_LONG` arm/disarm.
- README + UPDATES (`0.1.0` then bumps: bugfix subsubver, feature subver). Newest UPDATES on top.
- **Commits:** include the Commit step in the task. The controller must skip `git commit` unless the user explicitly allowed commits for this run; then leave a dirty tree and report files.
- **Models:** never `composer-2.5-fast`, never Kimi 3. Mechanical implementer: `composer-2.5` or `inherit`. Integration implementer and every reviewer: `inherit` or `cursor-grok-4.6-xhigh`.
- One implementer at a time. After each task: reviewer (spec + quality). Critical/Important → fix → re-review. Ledger: `.superpowers/sdd/progress.md`.

---

## Subagent protocol (every task)

Controller, for Task N:

1. Check ledger; skip if complete.
2. Extract the `### Task N:` section into a brief file (do not paste the whole plan into the implementer).
3. Dispatch **implementer** (`generalPurpose`) with: scene one-liner, brief path, prior interfaces listed in the task **Consumes** block, report path `…/task-N-report.md`, TDD required, workdir ExperimentAnalysis.
4. Implementer writes **this task's unit tests** first, runs them (expect fail), implements, re-runs **the same unit tests**, self-reviews, writes the report (status, commits, **full test command + full output**, concerns). Returns only status + one-line test summary.
5. Dispatch **reviewer** (`generalPurpose`) with brief + report + `git diff` package. Reviewer returns spec ✅/❌ and quality Approved/Changes. Do not tell the reviewer what not to flag.
6. Fix Critical/Important with a fix subagent that re-runs **the covering unit tests**. Re-review.
7. Append ledger: `Task N: complete (commits …, unit tests pass, review clean)`.

**Unit-test gate (every task except 44–45):**
- Command is the task's `Run:` line (that file or node test only).
- Do not run Baseball E2E during Tasks 1–43 (`pytest -m "not e2e"` is the default).
- Reviewer **must fail** the task if: no test file, tests do not assert behavior, tests were not executed, or output is missing from the report.

**Implementer must not:** read later tasks, add features not in this task, change ports, commit secrets, touch sibling CatSwarm repos.

**Reviewer must check:** Global Constraints, this task's **Produces** signatures, **unit tests run and passed**, tests actually assert behavior, no password leaks, YAGNI.

---

## File map

| Path | Responsibility |
|---|---|
| `README.md` / `UPDATES.md` | Project docs |
| `.gitignore` | `experiments/`, venvs, `node_modules`, `.env`, `secrets.json` |
| `web/backend/ports.py` | `BACKEND_HOST`, `BACKEND_PORT=6400`, `FRONTEND_PORT=6473` |
| `web/backend/paths.py` | Repo root, experiments dir (`EA_EXPERIMENTS_DIR` override) |
| `web/backend/ea/slug.py` | Name → slug |
| `web/backend/ea/drone_id.py` | Filename → drone id or `needs_id` |
| `web/backend/ea/manifest.py` | Load/save/merge manifest v1 |
| `web/backend/ea/store.py` | Create/list/open experiment folders |
| `web/backend/ea/ingest_files.py` | Copy local files into `raw/drone_<id>/` |
| `web/backend/ea/ulog_min.py` | Tiny ULog writer for fixtures |
| `web/backend/ea/extract_ulog.py` | `.ulg` → parquet topics |
| `web/backend/ea/sync.py` | ARM detection + `sync.json` + `T` mapping |
| `web/backend/ea/geo.py` | LLA↔ENU, NED↔ENU |
| `web/backend/ea/pose.py` | Interpolated pose-at-t |
| `web/backend/ea/series.py` | Channel series in experiment time |
| `web/backend/ea/extract_sm.py` | SM CSV → parquet |
| `web/backend/ea/extract_ha.py` | HA logs → parquet or skip |
| `web/backend/ea/ingest_ssh.py` | rsync/scp from Pi |
| `web/backend/ea/ingest_mavlink.py` | LOG_REQUEST download |
| `web/backend/app.py` | FastAPI routes |
| `web/frontend/` | React UI |
| `web/backend/tests/test_e2e_baseball.py` | API E2E on operator Baseball ulogs |
| `web/frontend/e2e/baseball.spec.ts` | Playwright UI E2E on Baseball |

---

## Task index

Phase 1 (local ulog replay): 1–24  
Phase 2 (avatars, plots, markers, map): 25–32  
Phase 3 (SSH, MAVLink, SM/HA, sim): 33–40  
Phase 4 (Cesium): 41–43  
**Final E2E on Baseball ulogs: 44–45** (required; uses `/home/valentin/RL/TESTFLIGHTS/Baseball/`)

---

### Task 1: Repo docs and gitignore

**Files:**
- Create: `.gitignore`, `README.md`, `UPDATES.md`, `experiments/.gitkeep` (optional; folder still ignored)
- Keep: `docs/2026-08-27-experiment-analysis-design.md`
- Test: `web/backend/tests/test_layout.py`

**Interfaces:**
- Consumes: nothing
- Produces: documented layout; gitignore must contain `experiments/`

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

Create `web/backend/tests/test_layout.py`:

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_gitignore_excludes_experiments():
    text = (ROOT / ".gitignore").read_text()
    assert "experiments/" in text
    assert "node_modules/" in text
    assert ".env" in text


def test_readme_and_updates_exist():
    readme = (ROOT / "README.md").read_text()
    updates = (ROOT / "UPDATES.md").read_text()
    assert "ExperimentAnalysis" in readme
    assert "UPDATES.md" in readme
    assert "## 0.1.0" in updates
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/valentin/RL/CatSwarm/ExperimentAnalysis && python -m pytest web/backend/tests/test_layout.py -v`  
Expected: FAIL (missing files or collection error)

- [ ] **Step 3: Write minimal implementation**

`.gitignore`:

```
experiments/
web/backend/.venv/
web/backend/__pycache__/
web/backend/**/__pycache__/
web/frontend/node_modules/
web/frontend/dist/
.env
.env.*
secrets.json
*.pyc
.pytest_cache/
```

`README.md` — idea (reconstruct experiments from ulg + Pi logs), architecture (FastAPI `:6400`, Vite `:6473`, experiment folders), reading order (README then UPDATES). Ports 6400/6473 named.

`UPDATES.md`:

```markdown
# Updates

## 0.1.0 - Project bootstrap
- ExperimentAnalysis repo, docs, gitignore for experiment folders
```

If git is not initialized: `git init -b main` in ExperimentAnalysis only.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `python -m pytest web/backend/tests/test_layout.py -v`  
Expected: PASS

- [ ] **Step 5: Commit** (if user allowed)

```bash
git add .gitignore README.md UPDATES.md web/backend/tests/test_layout.py docs
git commit -m "chore: bootstrap ExperimentAnalysis docs and gitignore"
```

---

### Task 2: Ports and paths helpers

**Files:**
- Create: `web/backend/ports.py`, `web/backend/paths.py`, `web/backend/tests/test_ports_paths.py`, `web/backend/pytest.ini`

**Interfaces:**
- Consumes: repo root from Task 1
- Produces:
  - `BACKEND_HOST = "127.0.0.1"`
  - `BACKEND_PORT = 6400`
  - `FRONTEND_PORT = 6473`
  - `FORBIDDEN_PORTS = (5000, 6173, 3001, 5173)`
  - `def repo_root() -> Path`
  - `def experiments_dir() -> Path`  # env `EA_EXPERIMENTS_DIR` else `<repo>/experiments`

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
import os
from ports import BACKEND_PORT, FRONTEND_PORT, FORBIDDEN_PORTS, BACKEND_HOST
from paths import experiments_dir, repo_root


def test_ports_do_not_collide():
    assert BACKEND_HOST == "127.0.0.1"
    assert BACKEND_PORT == 6400
    assert FRONTEND_PORT == 6473
    assert BACKEND_PORT not in FORBIDDEN_PORTS
    assert FRONTEND_PORT not in FORBIDDEN_PORTS
    assert FORBIDDEN_PORTS == (5000, 6173, 3001, 5173)


def test_experiments_dir_default(tmp_path, monkeypatch):
    monkeypatch.delenv("EA_EXPERIMENTS_DIR", raising=False)
    assert experiments_dir() == repo_root() / "experiments"


def test_experiments_dir_override(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    assert experiments_dir() == tmp_path
```

`pytest.ini`:

```ini
[pytest]
pythonpath = web/backend
testpaths = web/backend/tests
addopts = -m "not e2e"
markers =
    e2e: operator Baseball ulogs at /home/valentin/RL/TESTFLIGHTS/Baseball
```

Run pytest from repo root so `pythonpath = web/backend` works. Tests import `ports` and `paths`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/valentin/RL/CatSwarm/ExperimentAnalysis && python -m pytest web/backend/tests/test_ports_paths.py -v`  
Expected: FAIL import error

- [ ] **Step 3: Write minimal implementation**

`ports.py`:

```python
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 6400
FRONTEND_PORT = 6473
FORBIDDEN_PORTS = (5000, 6173, 3001, 5173)
```

`paths.py`:

```python
import os
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def experiments_dir() -> Path:
    override = os.environ.get("EA_EXPERIMENTS_DIR")
    if override:
        return Path(override)
    return repo_root() / "experiments"
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `python -m pytest web/backend/tests/test_ports_paths.py -v`  
Expected: PASS

- [ ] **Step 5: Commit** (if allowed)

```bash
git add web/backend/ports.py web/backend/paths.py web/backend/pytest.ini web/backend/tests/test_ports_paths.py
git commit -m "feat: reserve API 6400 and UI 6473"
```

---

### Task 3: Slug sanitizer

**Files:**
- Create: `web/backend/ea/__init__.py`, `web/backend/ea/slug.py`
- Test: `web/backend/tests/test_slug.py`

**Interfaces:**
- Consumes: nothing
- Produces: `def slugify(name: str) -> str` — keep `[A-Za-z0-9_-]`, spaces → `_`, strip other chars, reject empty (`ValueError`)

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
import pytest
from ea.slug import slugify


def test_slugify_baseball():
    assert slugify("Baseball") == "Baseball"
    assert slugify("flight 01") == "flight_01"


def test_slugify_rejects_empty():
    with pytest.raises(ValueError):
        slugify("***")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest web/backend/tests/test_slug.py -v`  
Expected: FAIL import

- [ ] **Step 3: Write minimal implementation**

```python
import re

_KEEP = re.compile(r"[^A-Za-z0-9_-]+")


def slugify(name: str) -> str:
    s = _KEEP.sub("_", name.strip()).strip("_")
    s = re.sub(r"_+", "_", s)
    if not s or not re.fullmatch(r"[A-Za-z0-9_-]+", s):
        raise ValueError(f"invalid experiment name: {name!r}")
    return s
```

- [ ] **Step 4: Run the tests and make sure they pass**

Expected: PASS

- [ ] **Step 5: Commit** (if allowed) `feat: slugify experiment names`

---

### Task 4: Drone id from filename

**Files:**
- Create: `web/backend/ea/drone_id.py`
- Test: `web/backend/tests/test_drone_id.py`

**Interfaces:**
- Consumes: nothing
- Produces: `def drone_id_from_filename(name: str) -> int | None`  
  Regex `Group3RLcat(?P<id>\d+)_` then `_d(?P<id>\d+)`. `None` means `needs_id`.

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
from ea.drone_id import drone_id_from_filename


def test_group3rlcat():
    assert drone_id_from_filename(
        "Group3RLcat3_log_18_2026-8-25-17-05-26.ulg"
    ) == 3
    assert drone_id_from_filename(
        "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg"
    ) == 2
    assert drone_id_from_filename(
        "Group3RLcat4_log_28_2026-8-25-17-05-24.ulg"
    ) == 4


def test_sm_suffix():
    assert drone_id_from_filename("20260814_070958_system_manager_d2.csv") == 2


def test_needs_id():
    assert drone_id_from_filename("random.ulg") is None
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL import

- [ ] **Step 3: Write minimal implementation**

```python
import re

_CAT = re.compile(r"Group3RLcat(?P<id>\d+)_")
_D = re.compile(r"_d(?P<id>\d+)(?:\.|_)")


def drone_id_from_filename(name: str) -> int | None:
    m = _CAT.search(name)
    if m:
        return int(m.group("id"))
    m = _D.search(name)
    if m:
        return int(m.group("id"))
    return None
```

If `_d2.csv` does not match `_d(?P<id>\d+)(?:\.|_)`, adjust to `_d(?P<id>\d+)(?:\.[A-Za-z0-9]+)?$` so `…_d2.csv` matches.

- [ ] **Step 4: Run the tests and make sure they pass**

Expected: PASS including Baseball names

- [ ] **Step 5: Commit** (if allowed) `feat: parse physical drone id from log filenames`

---

### Task 5: Manifest v1 load/save

**Files:**
- Create: `web/backend/ea/manifest.py`
- Test: `web/backend/tests/test_manifest.py`

**Interfaces:**
- Consumes: `slugify` unused here
- Produces:
  - `MANIFEST_VERSION = 1`
  - `def empty_manifest(name: str) -> dict`
  - `def load_manifest(path: Path) -> dict`
  - `def save_manifest(path: Path, data: dict) -> None`
  - `def merge_manifest(dst: dict, patch: dict) -> dict` — deep-merge `ui` and per-drone `ssh`/`mavlink`; never drop `sources` arrays unless patch includes them
  - empty_manifest drones `[]`, sync.mode `"arm"`, ui.engine3d `"plotly"`, ui.avatars `{}`, ui.markers `[]`

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
from ea.manifest import empty_manifest, save_manifest, load_manifest, merge_manifest


def test_roundtrip(tmp_path):
    m = empty_manifest("Baseball")
    assert m["version"] == 1
    assert m["name"] == "Baseball"
    assert m["drones"] == []
    assert m["sync"]["mode"] == "arm"
    assert m["ui"]["engine3d"] == "plotly"
    p = tmp_path / "manifest.json"
    save_manifest(p, m)
    loaded = load_manifest(p)
    assert loaded["name"] == "Baseball"


def test_merge_ui_keeps_sources():
    m = empty_manifest("X")
    m["drones"] = [{
        "id": 2,
        "label": "D2",
        "ssh": {"user": "pi", "host": "192.168.31.30"},
        "mavlink": {"url": "tcp:192.168.31.30:5760"},
        "sources": {"ulg": ["raw/drone_2/a.ulg"], "system_manager": [], "hardware_adapter": []},
    }]
    merged = merge_manifest(m, {"ui": {"visible_drone_ids": [2, 3, 4]}})
    assert merged["drones"][0]["sources"]["ulg"] == ["raw/drone_2/a.ulg"]
    assert merged["ui"]["visible_drone_ids"] == [2, 3, 4]
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL import

- [ ] **Step 3: Write minimal implementation**

Use `json` dump/load with indent=2. `empty_manifest` sets `created_at` ISO-8601 UTC. `merge_manifest` copies dst, updates top-level keys except it merges dict `ui` and `sync`; drones replaced only if `patch` has `drones`.

- [ ] **Step 4: Run the tests and make sure they pass**

Expected: PASS

- [ ] **Step 5: Commit** (if allowed) `feat: experiment manifest v1`

---

### Task 6: Experiment store create/list/open

**Files:**
- Create: `web/backend/ea/store.py`
- Test: `web/backend/tests/test_store.py`

**Interfaces:**
- Consumes: `slugify`, `empty_manifest`, `save_manifest`, `load_manifest`, `experiments_dir`
- Produces:
  - `def create_experiment(name: str) -> dict` → `{slug, path, manifest}` ; creates `raw/`, `derived/`, `manifest.json`
  - `def list_experiments() -> list[dict]` → `{slug, name, drone_ids, missing}`
  - `def open_experiment(slug: str) -> dict` ; `FileNotFoundError` if missing
  - `missing` = drone ids whose `sources.ulg` is empty

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
from ea.store import create_experiment, list_experiments, open_experiment


def test_create_and_list(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    created = create_experiment("Baseball")
    assert created["slug"] == "Baseball"
    assert (tmp_path / "Baseball" / "manifest.json").is_file()
    assert (tmp_path / "Baseball" / "raw").is_dir()
    assert (tmp_path / "Baseball" / "derived").is_dir()
    listed = list_experiments()
    assert listed[0]["slug"] == "Baseball"
    assert listed[0]["drone_ids"] == []
    opened = open_experiment("Baseball")
    assert opened["manifest"]["name"] == "Baseball"
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL import

- [ ] **Step 3: Write minimal implementation**

`create_experiment`: slugify, mkdir parents, write empty manifest. If folder exists, raise `FileExistsError`.

- [ ] **Step 4: Run the tests and make sure they pass**

Expected: PASS

- [ ] **Step 5: Commit** (if allowed) `feat: create and list experiment folders`

---

### Task 7: FastAPI app health + experiments CRUD

**Files:**
- Create: `web/backend/app.py`, `web/backend/requirements.txt`
- Test: `web/backend/tests/test_api_experiments.py`

**Interfaces:**
- Consumes: store, ports, manifest.merge_manifest
- Produces: FastAPI `app` with
  - `GET /api/health` → `{"ok": true}`
  - `GET /api/experiments`
  - `POST /api/experiments` body `{name}`
  - `GET /api/experiments/{slug}` 404 if missing
  - `PATCH /api/experiments/{slug}/manifest` body = patch dict

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
from fastapi.testclient import TestClient
from app import app


def test_health():
    c = TestClient(app)
    r = c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_create_list_get_patch(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post("/api/experiments", json={"name": "Baseball"})
    assert r.status_code == 200
    assert r.json()["slug"] == "Baseball"
    r = c.get("/api/experiments")
    assert any(x["slug"] == "Baseball" for x in r.json())
    r = c.get("/api/experiments/nope")
    assert r.status_code == 404
    r = c.patch("/api/experiments/Baseball/manifest", json={"ui": {"engine3d": "plotly"}})
    assert r.status_code == 200
    assert r.json()["manifest"]["ui"]["engine3d"] == "plotly"
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL import

- [ ] **Step 3: Write minimal implementation**

`requirements.txt`:

```
fastapi>=0.115.0
uvicorn>=0.32.0
pyulog>=1.0.0
pyarrow>=17.0.0
pandas>=2.2.0
pymavlink>=2.4.0
pytest>=8.0.0
httpx>=0.27.0
```

`app.py`: create FastAPI, CORS for `http://127.0.0.1:6473`, routes as specified. 404 JSON `{"detail": "experiment not found"}`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pip install -r web/backend/requirements.txt && python -m pytest web/backend/tests/test_api_experiments.py -v`  
Expected: PASS

- [ ] **Step 5: Commit** (if allowed) `feat: FastAPI health and experiment CRUD`

---

### Task 8: Import local files into raw/

**Files:**
- Create: `web/backend/ea/ingest_files.py`
- Modify: `web/backend/app.py` — `POST /api/experiments/{slug}/import`
- Test: `web/backend/tests/test_ingest_files.py`

**Interfaces:**
- Consumes: `drone_id_from_filename`, store, manifest save
- Produces:
  - `def import_paths(slug: str, paths: list[str]) -> dict`  
    Result: `{ok: bool, drones: {id: {ok, error?}}, needs_id: [filenames]}`  
    Copy `.ulg` into `raw/drone_<id>/`. Directories are scanned non-recursively for `.ulg`. Unknown names go to `needs_id` and are not copied. `ok` true if at least one drone copied. Update manifest `drones` entries and `sources.ulg` relative paths. Append-only: if dest exists, suffix `_<utc>`.
  - Route body `{paths: string[]}`

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path
from ea.store import create_experiment
from ea.ingest_files import import_paths


def test_import_three_named_ulogs(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("Baseball")
    src = tmp_path / "incoming"
    src.mkdir()
    for n in (2, 3, 4):
        (src / f"Group3RLcat{n}_log_1.ulg").write_bytes(b"ULog")
    result = import_paths("Baseball", [str(src)])
    assert result["ok"] is True
    assert set(result["drones"]) >= {"2", "3", "4"} or set(int(k) for k in result["drones"]) >= {2, 3, 4}
    root = tmp_path / "Baseball"
    assert (root / "raw" / "drone_2").exists()
    assert list((root / "raw" / "drone_3").glob("*.ulg"))
    assert list((root / "raw" / "drone_4").glob("*.ulg"))


def test_needs_id(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    create_experiment("X")
    f = tmp_path / "mystery.ulg"
    f.write_bytes(b"ULog")
    result = import_paths("X", [str(f)])
    assert result["needs_id"]
    assert not (tmp_path / "X" / "raw" / "drone_1").exists()
```

Use string keys `"2"` in JSON-facing dicts (spec pull payload uses string ids). Internally int ids are fine if JSON encoder converts; tests should accept either by normalizing `int(k)`.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL import

- [ ] **Step 3: Write minimal implementation**

Copy with `shutil.copy2`. Ensure drone dict exists with default ssh empty host, mavlink `tcp:<host>:5760` only when host known (leave host `""` if unknown).

- [ ] **Step 4: Run the tests and make sure they pass**

Plus API test: POST import via TestClient.

Expected: PASS

- [ ] **Step 5: Commit** (if allowed) `feat: import ulog files into experiment raw/`

---

### Task 9: Minimal ULog fixture writer

**Files:**
- Create: `web/backend/ea/ulog_min.py`
- Test: `web/backend/tests/test_ulog_min.py`

**Interfaces:**
- Consumes: nothing
- Produces: `def write_min_ulog(path: Path, messages: dict) -> None`  
  `messages` keys: topic name → list of dicts of fields. Always include `timestamp` uint64 microseconds. Must be readable by `pyulog.ULog`.

**Subagent:** integration implementer then reviewer (ulog binary format).

- [ ] **Step 1: Write the failing test**

```python
from pyulog import ULog
from ea.ulog_min import write_min_ulog


def test_pyulog_reads_written_file(tmp_path):
    p = tmp_path / "a.ulg"
    write_min_ulog(p, {
        "vehicle_status": [
            {"timestamp": 1000, "arming_state": 1},
            {"timestamp": 5000, "arming_state": 2},
        ],
        "vehicle_local_position": [
            {"timestamp": 1000, "x": 0.0, "y": 0.0, "z": 0.0},
            {"timestamp": 5000, "x": 1.0, "y": 2.0, "z": -3.0},
        ],
        "vehicle_attitude": [
            {"timestamp": 1000, "q[0]": 1.0, "q[1]": 0.0, "q[2]": 0.0, "q[3]": 0.0},
        ],
        "vehicle_gps_position": [
            {"timestamp": 5000, "lat": 320800000, "lon": 347800000, "alt": 50000},
        ],
    })
    ulog = ULog(str(p))
    vs = ulog.get_dataset("vehicle_status")
    assert list(vs.data["arming_state"]) == [1, 2]
```

PX4 GPS lat/lon are 1e-7 deg integers in `vehicle_gps_position`; alt millimetres. Writer may use float degrees in a test-only topic layout **or** PX4 integer fields — pick PX4 integer lat/lon/alt so extract matches real logs. Attitude quaternion in PX4 is `q[0]..q[3]` wxyz. Spec pose uses xyzw; convert in pose task, not here.

If pyulog rejects `q[0]` names, use fields `q0,q1,q2,q3` (wxyz) and map in extract.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL import or pyulog parse error

- [ ] **Step 3: Write minimal implementation**

Implement ULog v1: 16-byte header `ULog\x01\x12\x35` + version 1 + timestamp 0; `B` flag bits; `F` format; `A` add-logged; `D` data. Use little-endian. Document field types: timestamp `uint64`, arming_state `uint8`, x/y/z `float`, lat/lon `int32`, alt `int32`.

- [ ] **Step 4: Run the tests and make sure they pass**

Expected: PASS with real pyulog

- [ ] **Step 5: Commit** (if allowed) `feat: minimal ulog writer for fixtures`

---

### Task 10: Extract ulog topics to parquet

**Files:**
- Create: `web/backend/ea/extract_ulog.py`
- Test: `web/backend/tests/test_extract_ulog.py`

**Interfaces:**
- Consumes: `write_min_ulog`, pyarrow
- Produces:
  - `ALWAYS = ("vehicle_local_position", "vehicle_gps_position", "vehicle_attitude", "vehicle_status", "home_position")`
  - GPS fallback: if `vehicle_gps_position` missing, extract `vehicle_global_position`
  - `def extract_ulog(ulg_path: Path, dest_dir: Path) -> list[str]` — writes `dest_dir/{topic}.parquet`, returns topic names written
  - parquet column `timestamp` uint64

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** using `write_min_ulog`, then `extract_ulog`, read parquet, assert `vehicle_status` arming_state and local_position x.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

```python
from pyulog import ULog
import pyarrow as pa
import pyarrow.parquet as pq

ALWAYS = (
    "vehicle_local_position",
    "vehicle_gps_position",
    "vehicle_attitude",
    "vehicle_status",
    "home_position",
)


def extract_ulog(ulg_path, dest_dir, extra_topics=()):
    dest_dir.mkdir(parents=True, exist_ok=True)
    ulog = ULog(str(ulg_path))
    names = {d.name for d in ulog.data_list}
    topics = [t for t in ALWAYS if t in names]
    if "vehicle_gps_position" not in names and "vehicle_global_position" in names:
        topics.append("vehicle_global_position")
    for t in extra_topics:
        if t in names and t not in topics:
            topics.append(t)
    written = []
    for t in topics:
        ds = ulog.get_dataset(t)
        table = pa.table(ds.data)
        pq.write_table(table, dest_dir / f"{t}.parquet")
        written.append(t)
    return written
```

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: extract ulog topics to parquet`

---

### Task 11: Find ulog ARM timestamp

**Files:**
- Create: `web/backend/ea/arm.py`
- Test: `web/backend/tests/test_arm.py`

**Interfaces:**
- Consumes: parquet from Task 10
- Produces:
  - `def ulog_arm_us(status_parquet: Path | None, actuator_parquet: Path | None) -> int | None`
  - First row where `arming_state == 2`; else first `armed == 1` / `== True`

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

Two-row vehicle_status parquet (or pandas write) timestamps 1000 state 1 then 5000 state 2 → `5000`. All-disarmed → `None`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation** using pandas `read_parquet`.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: detect PX4 ARM timestamp`

---

### Task 12: Build sync.json and map T

**Files:**
- Create: `web/backend/ea/sync.py`
- Test: `web/backend/tests/test_sync.py`

**Interfaces:**
- Consumes: `ulog_arm_us`
- Produces:
  - `def write_sync(experiment_dir: Path, per_drone: dict) -> dict` writes `derived/sync.json`
  - `def t_ulog(t_us: float, arm_us: int | None, first_us: int) -> float`  
    if arm_us is not None: `(t_us - arm_us) / 1e6` else `(t_us - first_us) / 1e6`
  - `def t_sm(local_ts: float, arm_local: float | None, first_local: float) -> float`  
    if arm_local is not None: `local_ts - arm_local` else `local_ts - first_local`
  - Two drones with arm_us 1000 and 9000: both have `t_ulog(arm, arm, first)==0`

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** for two-drone ARM alignment `T=0`, missing ARM uses first sample, SM formula not using `timestamp`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation** matching spec section 8 JSON shape (`ulog_arm_us`, `sm_arm_local_ts`, `synced`, `note`). `synced` True iff `ulog_arm_us` is not None.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: ARM experiment time mapping`

---

### Task 13: Geo ENU helpers

**Files:**
- Create: `web/backend/ea/geo.py`
- Test: `web/backend/tests/test_geo.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `WGS84_A_M = 6378137`
  - `METERS_PER_DEG_LAT = WGS84_A_M * pi / 180`
  - `def lla_to_enu(lat, lon, alt, origin_lat, origin_lon, origin_alt) -> tuple[e,n,u]`
  - `def ned_to_enu(n, e, d) -> tuple[e,n,u]`  # args are NED x,y,z (z down)
  - `def mean_origin(llas: list[tuple[lat,lon,alt]]) -> tuple[lat,lon,alt]`

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

Origin 32.08, 34.78, 50. Point 1m north → n≈1, e≈0. `ned_to_enu(1, 2, 3)` → `(2, 1, -3)`. Empty llas → `ValueError`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation** matching Observation Board spherical WGS84 (not 111111).

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: ENU geo helpers`

---

### Task 14: Interpolate pose samples

**Files:**
- Create: `web/backend/ea/interp.py`
- Test: `web/backend/tests/test_interp.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `def interp_scalar(t, ts, ys) -> float | None` linear; None if `ts` empty; clamp outside range? Spec: outside data → drone `present: false` so pose layer handles range; this function returns None if t < ts[0] or t > ts[-1]
  - `def slerp_xyzw(t, ts, quats_xyzw: list[tuple]) -> tuple | None`

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

ts=[0,10], ys=[0,10], t=5 → 5. t=-1 → None. Identity to 90° about z at t midpoint ≈ 45°.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

numpy `interp` for scalars. Slerp: normalize, flip sign if dot<0, `sin` blend.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: linear pose interpolation and slerp`

---

### Task 15: pose_at query builder

**Files:**
- Create: `web/backend/ea/pose.py`
- Test: `web/backend/tests/test_pose.py`

**Interfaces:**
- Consumes: extract, sync, geo, interp, arm
- Produces: `def pose_at(experiment_dir: Path, t: float) -> dict` with exact spec keys: `t`, `origin`, `drones.{id}.present|synced|attitude_q_xyzw|avatars`. Phase 1 avatars: `ekf_ned` only (GPS avatar Task 25). Convert PX4 `q` wxyz → xyzw. EKF: local_position x,y,z NED → ENU via home/GPS at ARM if available else local frame `(e,n,u)` from `ned_to_enu` at origin 0 and set `local_frame: true` on that drone dict.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test**

Build experiment dir: write ulog with arm at 5000us, local pos at 5000 (0,0,0) and 15000 (1,0,0). Extract, write_sync. `pose_at(..., t=0)` present, ekf near 0. `pose_at(..., t=0.005)` n≈1 (NED x is north). `pose_at(..., t=99)` present False.

Partial: three drones, only 2 and 4 have parquet; 3 listed in manifest without ulog → present False.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

GPS lat: if values look like 1e7 ints (`abs(lat)>1000`), divide lat/lon by 1e7, alt by 1000.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: pose-at-t from parquet`

---

### Task 16: series + topics

**Files:**
- Create: `web/backend/ea/series.py`, `web/backend/ea/topics.py`
- Test: `web/backend/tests/test_series.py`

**Interfaces:**
- Consumes: sync `t_ulog`
- Produces:
  - `def list_topics(experiment_dir) -> dict` tree drone → source → topic → fields
  - `def series(experiment_dir, channels: list[str], t0=None, t1=None) -> dict`  
    `{channel: {t: [...], y: [...]}}` in experiment time  
    Downsample pose-like topics to max 20 Hz unless channel requested (always 20 Hz for phase 1 series)

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test**

Channel `2.ulog.vehicle_local_position.x` returns t relative to ARM (0 at arm). Invalid channel → omit with empty arrays, not 500.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

Parse channel id split on `.` max 3 splits after drone: `id, source, rest` then last field after last dot, topic is the middle. Example `2.ulog.vehicle_local_position.x` → drone 2, ulog, vehicle_local_position, x.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: channel topics and series in experiment time`

---

### Task 17: Rebuild pipeline + pose/series routes

**Files:**
- Modify: `web/backend/app.py`, add `web/backend/ea/rebuild.py`
- Test: `web/backend/tests/test_api_pose.py`

**Interfaces:**
- Consumes: ingest, extract, sync, pose, series
- Produces:
  - `def rebuild(slug: str) -> dict` extract all ulogs under raw/drone_*/ , write sync.json
  - `POST /api/experiments/{slug}/rebuild`
  - `GET /api/experiments/{slug}/pose?t=`
  - `GET /api/experiments/{slug}/series?channels=` repeatable
  - `GET /api/experiments/{slug}/topics`

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test**

Create experiment, import generated ulog for drone 2, rebuild, GET pose t=0 status 200 with drones.2.present true. Unknown slug 404.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation** wiring rebuild after import (import does not have to auto-rebuild; rebuild is explicit — UI will call it. Import test may call rebuild).

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: rebuild extract and pose/series HTTP API`

---

### Task 18: Frontend Vite + Tailwind + proxy

**Files:**
- Create: `web/frontend/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Test: `web/frontend/src/ports.test.ts` (vitest) asserting proxy target 6400 and app title

**Interfaces:**
- Consumes: FRONTEND_PORT 6473
- Produces: Vite server `127.0.0.1:6473`, proxy `/api` → `http://127.0.0.1:6400`

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test**

`vite.config.ts` must export server.port 6473 and proxy `/api`. Test by reading file or importing config:

```ts
import { describe, it, expect } from "vitest";
import config from "../vite.config";

describe("vite ports", () => {
  it("uses 6473 and proxies api to 6400", () => {
    const c = typeof config === "function" ? config({ command: "serve", mode: "test" }) : config;
    expect(c.server.port).toBe(6473);
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.server.proxy["/api"].target).toBe("http://127.0.0.1:6400");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/frontend && npm install && npx vitest run`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

React 19, Vite 7, Tailwind 4 `@tailwindcss/vite`, vitest. `App.tsx` renders `h1` ExperimentAnalysis. Dark background `bg-zinc-950 text-zinc-100`.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: Vite React Tailwind UI on 6473`

---

### Task 19: API client + experiment switcher

**Files:**
- Create: `web/frontend/src/api.ts`, `web/frontend/src/components/ExperimentBar.tsx`
- Modify: `App.tsx`
- Test: `web/frontend/src/api.test.ts` with mocked fetch

**Interfaces:**
- Consumes: `/api/experiments`
- Produces: `listExperiments()`, `createExperiment(name)`, `openExperiment(slug)`, `importPaths(slug, paths)`, `rebuild(slug)`  
  ExperimentBar: dropdown of slugs, New name+button, Import path text+button

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** for `listExperiments` parsing JSON array.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: experiment switcher API client`

---

### Task 20: Time cursor store

**Files:**
- Create: `web/frontend/src/timeCursor.ts`
- Test: `web/frontend/src/timeCursor.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: functions `advance(t, dt, direction, speed) => t + direction * speed * dt`  
  direction ∈ {-1, 0, 1}, speed ∈ {0.25, 1, 2, 4}, loop off (clamp 0..tMax)

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** reverse play decreases t; clamp.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: playback time cursor`

---

### Task 21: Plotly 3D body triads

**Files:**
- Create: `web/frontend/src/components/View3D.tsx`, `web/frontend/src/triad.ts`
- Test: `web/frontend/src/triad.test.ts`

**Interfaces:**
- Consumes: pose JSON
- Produces: `triadTraces(pos, q_xyzw, scale=1)` → three Plotly scatter3d line traces RGB body x/y/z. Rotate FRD axes by quaternion. No mesh.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** identity quat at origin: x-axis end ≈ (1,0,0) in ENU if body x is forward-east? Body FRD: x forward, y right, z down. In ENU at identity NED attitude, body x = north = +n. Spec: RGB = body x/y/z. Test identity: body x direction in ENU is +N (0,1,0) if Plotly axes are (e,n,u)=(x,y,z). **Lock Plotly scene:** `x=E, y=N, z=U`. Identity FRD→NED identity → body x = N = +Y, body y = E = +X, body z = down = −U.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write View3D** using `react-plotly.js` Plot, traces for triads + optional trail (trail empty until Task 22).

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: Plotly 3D body-axis triads`

---

### Task 22: Trails + pose polling

**Files:**
- Modify: `View3D.tsx`, `App.tsx`
- Create: `web/frontend/src/usePose.ts`
- Test: `web/frontend/src/downsample.test.ts`

**Interfaces:**
- Consumes: GET pose
- Produces: trail of last positions at ≤20 Hz (client samples pose while playing). `downsampleHz(ts, maxHz=20)`.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** for downsample.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Wire App to fetch pose when T changes; draw trail scatter3d**.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: 20 Hz pose trails`

---

### Task 23: Timeline play reverse pause

**Files:**
- Create: `web/frontend/src/components/Timeline.tsx`
- Test: `web/frontend/src/components/Timeline.test.tsx` (vitest + testing-library)

**Interfaces:**
- Consumes: `advance` from timeCursor
- Produces: slider, Play, Reverse, Pause, speed 0.25/1/2/4, numeric T. rAF while direction ≠ 0.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** that Pause sets direction 0 (unit test the callback logic if component is heavy).

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write Timeline and mount in App**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: scrub and play forward/reverse`

---

### Task 24: Default 2D NED plot + drone visibility

**Files:**
- Create: `web/frontend/src/components/ChannelPlot.tsx`, `web/frontend/src/components/DroneList.tsx`
- Modify: `App.tsx`
- Test: `web/frontend/src/visibleDrones.test.ts`

**Interfaces:**
- Consumes: series API, manifest drones
- Produces: one Plotly 2D plot of `*.ulog.vehicle_local_position.x/y/z` for visible drones; checkboxes hide drones in 3D and plots. Phase 1 complete: Baseball import + rebuild + 3 triads + plots.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** `filterVisible(ids, visible)` 

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement list + plot + shared T cursor line (shapes vertical line)**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: default NED plots and drone visibility`

---

### Task 25: GPS avatar beside EKF

**Files:**
- Modify: `web/backend/ea/pose.py`
- Test: `web/backend/tests/test_pose_gps.py`

**Interfaces:**
- Consumes: vehicle_gps_position, geo
- Produces: `avatars.gps` ENU when GPS exists; both avatars same payload. Origin = mean GPS at T=0.

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** two GPS points; pose at 0 has gps and ekf_ned keys.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: GPS and EKF avatars together`

---

### Task 26: Channel picker + extra Plotly panes

**Files:**
- Create: `web/frontend/src/components/PlotBoard.tsx`
- Modify: App
- Test: `web/frontend/src/plotBoard.test.ts`

**Interfaces:**
- Consumes: GET topics
- Produces: Add plot → select channel ids; each pane independent y, shared T; persist shape `{id, channels[]}` in memory (persist Task 28)

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** addPlot reducer.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: user-defined Plotly channel panes`

---

### Task 27: Persist ui in manifest

**Files:**
- Modify: api.ts, App.tsx
- Test: `web/backend/tests/test_api_manifest_ui.py`

**Interfaces:**
- Consumes: PATCH manifest
- Produces: saving visible_drone_ids, avatars, plots, engine3d, map_linked on change (debounced 300ms)

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** PATCH plots roundtrip GET.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement debounce save**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: persist UI layout in manifest`

---

### Task 28: Ground markers and distances

**Files:**
- Create: `web/backend/ea/markers.py`, `web/frontend/src/components/MarkerPanel.tsx`
- Modify: app.py `PATCH /api/experiments/{slug}/markers`, View3D click
- Test: `web/backend/tests/test_markers.py`

**Interfaces:**
- Consumes: geo
- Produces:
  - Marker `{id, label, lat, lon, alt_m}`
  - `def distance_m(a, b) -> {horizontal_m, enu_3d_m}`
  - Click ground (z=0 plane) converts ENU→LLA via inverse of lla_to_enu
  - Select two markers → show both distances

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** 1m north pair horizontal ≈1.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement** `enu_to_lla` inverse.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: ground markers and distance measurement`

---

### Task 29: Linked 2D scattermap

**Files:**
- Create: `web/frontend/src/components/Map2D.tsx`
- Test: `web/frontend/src/map2d.test.ts`

**Interfaces:**
- Consumes: pose gps avatars, markers
- Produces: Plotly `scattermap` `style: "open-street-map"`, no Mapbox token, same T dots, collapsible default open if any gps

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** that map figure layout map.style is `open-street-map` (helper `mapFigure(points)`).

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: linked OSM scattermap`

---

### Task 30: Vector arrows on avatars

**Files:**
- Modify: pose.py to include `vectors` from bound channels; View3D cone/line
- Test: `web/backend/tests/test_vectors.py`

**Interfaces:**
- Consumes: series 3-vector at t
- Produces: manifest `ui.vectors.{droneId} = {avatar, channels: [vx,vy,vz], scale}`  
  pose.drones[id].vectors.velocity = {e,n,u}  # NED vel rotated to ENU: vn,ve,vd → (ve, vn, -vd)

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** vx=0,vy=1,vz=0 NED → ENU e=1,n=0,u=0.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: vector overlays on 3D avatars`

---

### Task 31: start/kill/attach/install scripts

**Files:**
- Create: `start.sh`, `killall.sh`, `attach.sh`, `install.sh`
- Test: `web/backend/tests/test_scripts.py` reads scripts as text

**Interfaces:**
- Consumes: ports
- Produces:
  - tmux session `experiment_analysis` windows `backend` `frontend` only
  - killall frees **only** 6400 and 6473 (and `--port=` frontend override)
  - scripts must not mention 6173/3001/5173 as defaults to kill
  - install.sh: python venv `web/backend/.venv`, pip -r requirements, `npm install` in frontend

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]

def test_scripts_scoped():
    start = (ROOT / "start.sh").read_text()
    kill = (ROOT / "killall.sh").read_text()
    assert "6400" in start and "6473" in start
    assert "experiment_analysis" in start
    assert "ObservationBoard" not in kill or "Leaves ObservationBoard" in kill
    assert "killall.sh" in kill
    for bad in ("6173", "3001", "5173"):
        assert f"kill_port {bad}" not in kill
        assert f"lsof -ti:{bad}" not in kill
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write scripts** (scoped like GUI killall, different session name). `start.sh --port=` changes frontend only.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: scoped start/kill/attach/install`

---

### Task 32: Unsynced banner

**Files:**
- Modify: App.tsx, pose already has synced
- Test: `web/frontend/src/unsynced.test.ts`

**Interfaces:**
- Consumes: pose.drones[].synced
- Produces: banner listing unsynced ids; 3D still renders

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** `bannerText({2:{synced:false},3:{synced:true}})` contains `2` not `3`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: unsynced ARM banner`

---

### Task 33: SM CSV extract + S4 ARM

**Files:**
- Create: `web/backend/ea/extract_sm.py`
- Modify: `arm.py` `sm_arm_local_ts`
- Test: `web/backend/tests/test_extract_sm.py`

**Interfaces:**
- Consumes: pandas
- Produces: `extract_sm(csv, dest) → sm_system_manager.parquet`  
  `sm_arm_local_ts(df)` first row `state_machine_state` in `{4, "4", "S4_TAKEOFF"}` using `local_ts`. No S4 → None.

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** fixture CSV header including `local_ts,state_machine_state` rows S3 then S4_TAKEOFF.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**; rebuild also extracts `*system_manager*.csv`

- [ ] **Step 4: Run the tests and make sure they pass** including Pi/FC T=0 alignment test from spec.

- [ ] **Step 5: Commit** (if allowed) `feat: System Manager CSV extract and S4 ARM`

---

### Task 34: HA log extract

**Files:**
- Create: `web/backend/ea/extract_ha.py`
- Test: `web/backend/tests/test_extract_ha.py`

**Interfaces:**
- Consumes: nothing
- Produces: if lines match `^\d{4}-\d{2}-\d{2}.*` or leading float timestamp, write parquet; else return `skipped` and do not list in topics

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** unparseable file skipped; parseable file in topics later.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: hardware adapter log extract`

---

### Task 35: SSH ingest (mocked)

**Files:**
- Create: `web/backend/ea/ingest_ssh.py`
- Test: `web/backend/tests/test_ingest_ssh.py`

**Interfaces:**
- Consumes: manifest ssh user/host/password
- Produces: `def ssh_pull(slug, drone_id, runner=subprocess.run) -> dict`  
  rsync `pi@host:~/RL/system_manager/logs/` and `~/RL/hardware_adapter/logs/` into `raw/drone_<id>/`  
  Prefer `*_d{id}*` SM files. Do not delete raw on failure. Redact password from `error`. Publickey first: `ssh -o PreferredAuthentications=publickey`. Timeout 30s. Empty remote → ok False error `empty remote dir`.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** with fake runner recording argv; assert no password in returned error when runner fails with password in stderr.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: SSH pull of Pi logs`

---

### Task 36: MAVLink ulog download (mocked)

**Files:**
- Create: `web/backend/ea/ingest_mavlink.py`
- Test: `web/backend/tests/test_ingest_mavlink.py`

**Interfaces:**
- Consumes: pymavlink
- Produces: `def mavlink_pull(slug, drone_id, connect=...) -> dict`  
  Default url `tcp:{host}:5760`. List logs, download latest into raw. Must not call `command_long` / arm. Tests inject a fake connection.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** fake conn with log list + file bytes; assert dest ulg exists; assert code path never sends COMMAND_LONG (spy).

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement LOG_REQUEST_LIST / LOG_REQUEST_DATA**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: MAVLink ulog download`

---

### Task 37: POST pull + host seeds

**Files:**
- Modify: app.py, manifest empty drone defaults
- Test: `web/backend/tests/test_api_pull.py`

**Interfaces:**
- Consumes: ssh + mavlink ingest
- Produces: `POST /api/experiments/{slug}/pull` `{drone_id, adapters:["ssh"|"mavlink"]}`  
  HTTP 200 `{ok, drones}`  
  Seed when creating drones 2 and 4: hosts `192.168.31.30` and `192.168.31.152`, user `pi`, mavlink tcp 5760. Drone 3 no host.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** pull with mocked ingest functions; 404 unknown slug; password not in json.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**; UI pull buttons on DroneList (files already imported locally).

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: pull endpoint and D2/D4 host seeds`

---

### Task 38: needs_id assignment + sim local paths

**Files:**
- Modify: ingest_files.py — optional body `{assignments: {filename: id}}`
- Test: `web/backend/tests/test_needs_id.py`

**Interfaces:**
- Consumes: import
- Produces: second import call with assignments copies mystery files. Simulation: importing a directory of SM csv uses `_dN` ids (already Task 4). Document in README: point import at `system_manager/logs` / `hardware_adapter/logs`.

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** mystery.ulg + assignment 3 → raw/drone_3.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement UI prompt for needs_id list**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: needs_id assignment and sim folder import`

---

### Task 39: SM avatars sm_ned and sm_lla

**Files:**
- Modify: pose.py
- Test: `web/backend/tests/test_pose_sm.py`

**Interfaces:**
- Consumes: SM parquet columns pos_ned/*, lla/*
- Produces: avatars `sm_ned`, `sm_lla` when columns exist

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: System Manager pose avatars`

---

### Task 40: Manual offsets

**Files:**
- Modify: sync.py t_ulog/t_sm add `manual_offsets_s[str(drone_id)]`
- Test: `web/backend/tests/test_manual_offset.py`

**Interfaces:**
- Consumes: manifest.sync.manual_offsets_s
- Produces: T_final = T_arm + offset

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** offset 1.5 shifts pose

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: per-drone manual time offsets`

---

### Task 41: Cesium lazy engine

**Files:**
- Create: `web/frontend/src/components/View3DCesium.tsx`
- Modify: App engine toggle
- Test: `web/frontend/src/engineToggle.test.ts`

**Interfaces:**
- Consumes: same pose API
- Produces: `engine3d === "cesium"` dynamically `import("cesium")`. Plotly unmounted. Token-free OSM `UrlTemplateImageryProvider` `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. No Cesium Ion required.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing test** `shouldLoadCesium("cesium") === true`, `"plotly" === false`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement** body triads as Cesium polylines; same T.

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: Cesium globe engine switch`

---

### Task 42: Cesium markers share LLA

**Files:**
- Modify: View3DCesium.tsx
- Test: `web/frontend/src/cesiumMarkers.test.ts`

**Interfaces:**
- Consumes: markers API
- Produces: entities at marker LLA; click globe adds marker via same PATCH

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** helper `markerEntity(m)` lon/lat.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests and make sure they pass**

- [ ] **Step 5: Commit** (if allowed) `feat: Cesium markers on OSM globe`

---

### Task 43: Docs bump and Baseball operator note

**Files:**
- Modify: `README.md`, `UPDATES.md`
- Test: `web/backend/tests/test_layout.py` extend — README mentions Baseball path and ports

**Interfaces:**
- Consumes: all features
- Produces: UPDATES `0.4.0` (phase 4) history entries for 0.2.0/0.3.0/0.4.0; README how to import `/home/valentin/RL/TESTFLIGHTS/Baseball`, D2/D4 IPs, D3 ulog-only. Default unit tests still do not read TESTFLIGHTS; Tasks 44–45 do.

**Subagent:** mechanical implementer then reviewer.

- [ ] **Step 1: Write the failing test** README contains `6400`, `6473`, `TESTFLIGHTS/Baseball`, `192.168.31.30`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Update docs**

- [ ] **Step 4: Run unit tests (not e2e)**

Run: `python -m pytest web/backend/tests -v && cd web/frontend && npx vitest run`  
Expected: all PASS. Baseball E2E is **not** in this command (`-m "not e2e"` default).

- [ ] **Step 5: Commit** (if allowed) `docs: operator guide for Baseball reconstruction`

---

### Task 44: Backend E2E on Baseball ulogs

**Files:**
- Create: `web/backend/tests/test_e2e_baseball.py`
- Modify: `web/backend/pytest.ini` already has `e2e` marker from Task 2

**Interfaces:**
- Consumes: full API (create, import, rebuild, pose, series, topics, manifest)
- Produces: `@pytest.mark.e2e` tests that **fail** if Baseball is missing (no skip). Path `BASEBALL = Path("/home/valentin/RL/TESTFLIGHTS/Baseball")`. Files:
  - `Group3RLcat2_log_41_2026-8-25-17-05-30.ulg`
  - `Group3RLcat3_log_18_2026-8-25-17-05-26.ulg`
  - `Group3RLcat4_log_28_2026-8-25-17-05-24.ulg`

**Subagent:** integration implementer then reviewer. This task's "unit tests" **are** the E2E tests; run with `-m e2e` (override addopts).

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import app

BASEBALL = Path("/home/valentin/RL/TESTFLIGHTS/Baseball")
ULGS = {
    2: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
    3: "Group3RLcat3_log_18_2026-8-25-17-05-26.ulg",
    4: "Group3RLcat4_log_28_2026-8-25-17-05-24.ulg",
}


@pytest.mark.e2e
def test_baseball_dir_present():
    assert BASEBALL.is_dir(), f"missing {BASEBALL}"
    for name in ULGS.values():
        p = BASEBALL / name
        assert p.is_file() and p.stat().st_size > 1_000_000, p


@pytest.mark.e2e
def test_baseball_import_rebuild_pose(tmp_path, monkeypatch):
    monkeypatch.setenv("EA_EXPERIMENTS_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.post("/api/experiments", json={"name": "Baseball"})
    assert r.status_code == 200
    r = c.post("/api/experiments/Baseball/import", json={"paths": [str(BASEBALL)]})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body.get("needs_id") in (None, [])
    root = tmp_path / "Baseball"
    for i in (2, 3, 4):
        assert list((root / "raw" / f"drone_{i}").glob("*.ulg"))
    r = c.post("/api/experiments/Baseball/rebuild")
    assert r.status_code == 200
    r = c.get("/api/experiments/Baseball")
    man = r.json()["manifest"]
    ids = sorted(d["id"] for d in man["drones"])
    assert ids == [2, 3, 4]
    d3 = next(d for d in man["drones"] if d["id"] == 3)
    assert not (d3.get("ssh") or {}).get("host")
    d2 = next(d for d in man["drones"] if d["id"] == 2)
    assert d2["ssh"]["host"] == "192.168.31.30"
    d4 = next(d for d in man["drones"] if d["id"] == 4)
    assert d4["ssh"]["host"] == "192.168.31.152"
    r = c.get("/api/experiments/Baseball/pose", params={"t": 0})
    assert r.status_code == 200
    pose = r.json()
    assert "origin" in pose
    for i in ("2", "3", "4"):
        dr = pose["drones"][i]
        assert dr["present"] is True
        assert "ekf_ned" in dr["avatars"] or "gps" in dr["avatars"]
        assert "attitude_q_xyzw" in dr
        assert len(dr["attitude_q_xyzw"]) == 4
    r = c.get(
        "/api/experiments/Baseball/series",
        params=[
            ("channels", "2.ulog.vehicle_local_position.x"),
            ("channels", "3.ulog.vehicle_local_position.x"),
            ("channels", "4.ulog.vehicle_local_position.x"),
        ],
    )
    assert r.status_code == 200
    series = r.json()
    for ch in series.values():
        assert len(ch["t"]) > 10
        assert ch["t"][0] <= 0.5  # ARM at T=0 (allow small first-sample slack)
    r = c.get("/api/experiments/Baseball/topics")
    assert r.status_code == 200
    topics = r.json()
    for i in ("2", "3", "4"):
        assert i in topics or int(i) in {int(k) for k in topics}
```

If JSON keys for drones in topics are ints, normalize in the test with `str(k)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/valentin/RL/CatSwarm/ExperimentAnalysis && python -m pytest web/backend/tests/test_e2e_baseball.py -m e2e -v -o addopts=`  
Expected: FAIL until import/rebuild/pose work on real ulogs (or FAIL immediately if files missing)

- [ ] **Step 3: Fix product bugs only if E2E shows real defects** (do not weaken assertions; do not skip). Timeout: these ulogs are tens of MB; allow up to 5 minutes. Add `pytest.ini` `timeout` only if pytest-timeout is already a dep; otherwise no extra dep.

- [ ] **Step 4: Run the E2E tests and make sure they pass**

Run: `python -m pytest web/backend/tests/test_e2e_baseball.py -m e2e -v -o addopts=`  
Expected: PASS. Confirm drones 2, 3, 4 present; D3 has ulog and no SSH host.

- [ ] **Step 5: Commit** (if allowed) `test: Baseball API end-to-end on operator ulogs`

---

### Task 45: UI E2E on Baseball (browser)

**Files:**
- Create: `web/frontend/e2e/baseball.spec.ts`, `web/frontend/playwright.config.ts`
- Modify: `web/frontend/package.json` scripts `"test:e2e": "playwright test"`
- Test: this file is the test

**Interfaces:**
- Consumes: running API `:6400` and UI `:6473`, Baseball directory
- Produces: Playwright test that: opens UI, creates/selects experiment Baseball, imports `BASEBALL` path, waits for rebuild, asserts the page shows D2, D3, D4, a Plotly 3D container, and the time slider. D3 visible without Pi logs.

**Subagent:** integration implementer then reviewer.

- [ ] **Step 1: Write the failing Playwright spec**

```ts
import { test, expect } from "@playwright/test";

const BASEBALL = "/home/valentin/RL/TESTFLIGHTS/Baseball";

test("Baseball reconstruction in the UI", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("http://127.0.0.1:6473/");
  await expect(page.getByRole("heading", { name: /ExperimentAnalysis/i })).toBeVisible();
  await page.getByLabel(/name/i).fill("BaseballE2E");
  await page.getByRole("button", { name: /new/i }).click();
  await page.getByLabel(/import/i).fill(BASEBALL);
  await page.getByRole("button", { name: /import/i }).click();
  await expect(page.getByText("D2")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText("D3")).toBeVisible();
  await expect(page.getByText("D4")).toBeVisible();
  await expect(page.locator(".js-plotly-plot").first()).toBeVisible();
  await expect(page.getByRole("slider")).toBeVisible();
});
```

If labels differ from this spec, change the **UI** to expose accessible names `New`, `Import`, `Name`, drone labels `D2`/`D3`/`D4` — do not drop assertions.

- [ ] **Step 2: Run test to verify it fails**

Start backend+frontend on 6400/6473 (or have the spec `webServer` in `playwright.config.ts` spawn `web/backend/.venv/bin/uvicorn app:app --host 127.0.0.1 --port 6400` cwd backend, and `npm run dev -- --host 127.0.0.1 --port 6473`).  
Run: `cd web/frontend && npx playwright test e2e/baseball.spec.ts`  
Expected: FAIL until UI import+rebuild works

- [ ] **Step 3: Implement playwright.config.ts** with `webServer` array for API and Vite, `reuseExistingServer: true`. Do not bind 6173/3001/5173.

- [ ] **Step 4: Run the UI E2E and make sure it passes**

Run: `cd web/frontend && npx playwright test e2e/baseball.spec.ts`  
Expected: PASS on the three Baseball ulogs.

Also re-run unit tests to confirm no regression:

`python -m pytest web/backend/tests -v && npx vitest run`  
Expected: PASS (`e2e` marker still excluded from default pytest).

- [ ] **Step 5: Commit** (if allowed) `test: Baseball UI end-to-end`

---

## Self-review (plan vs spec)

| Spec section | Tasks |
|---|---|
| Ports 6400/6473, no OB/GUI collide | 2, 18, 31 |
| Experiment package raw/derived/manifest | 5, 6, 8 |
| Filename Group3RLcatN | 4, 8 |
| File import Baseball | 8, 43 |
| Extract ulog parquet | 9, 10, 17 |
| ARM T0 ulog | 11, 12 |
| Pose interpolation | 14, 15, 17 |
| Series/topics | 16, 17, 26 |
| Plotly 3D triads, play, 2D | 21–24 |
| GPS+EKF avatars | 25 |
| Markers/distances | 28 |
| scattermap OSM | 29 |
| Vectors | 30 |
| Partial data / unsynced | 15, 32 |
| SSH / MAVLink / SM / HA | 33–37 |
| Pi↔FC T | 12, 33 |
| Host seeds D2/D4, D3 later | 37 |
| needs_id | 38 |
| Cesium | 41, 42 |
| Gitignore experiments | 1 |
| No passwords in errors | 35, 37 |
| Unit tests per task (synthetic fixtures) | 1–43 (default pytest `-m "not e2e"`) |
| Baseball API E2E (real ulogs, fail if missing) | 44 |
| Baseball UI E2E (Playwright) | 45 |

No TBD in tasks. Phase 1 (1–24) is shippable ulog replay. Tasks 44–45 are the project-level gate on `/home/valentin/RL/TESTFLIGHTS/Baseball/`. Later tasks stay independently reviewable.

---

## Execution

Plan saved to `docs/2026-08-27-experiment-analysis-implementation-plan.md`.

**1. Subagent-Driven (recommended)** — Task N implementer → reviewer → ledger, models per Global Constraints.

**2. Inline Execution** — executing-plans in this session, same task order.

Which approach?
