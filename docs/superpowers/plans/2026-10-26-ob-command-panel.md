# Observation Board command panel on Analysis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an experiment folder contains an Observation Board `obs_*.csv`, Analysis shows the command-panel mission properties at the current time T under the marker list, and the same values are plot channels.

**Architecture:** Import copies `obs_*.csv` to `raw/observation/` and records one active path on `manifest.observation` (swarm-level, not a drone). Rebuild writes `derived/observation/command.parquet` (one row per change of a command-panel field, wall-clock `t_recv_s`) plus `derived/observation/anchor.json` (`arm_recv_s`). Experiment time is `t_recv_s - arm_recv_s`, where `arm_recv_s` is the first `armed=1` row. `pose_at` adds a `mission` object looked up by hold-last at T. Series source `ob` serves the same columns as steps. The Analysis column under Markers renders that object and updates whenever pose does.

**Tech Stack:** Python 3.11, FastAPI, pandas, pyarrow, pytest. React 19, TypeScript, Vitest, Testing Library.

**Spec:** Requested in chat on 2026-10-26. Binding decisions are Global Constraints and the Interfaces blocks. No separate spec file.

## Global Constraints

- Command-panel properties only, same fields as Observation Board `StatusPanel`: mission type, Vmax (`gs_goto_speed`), takeoff altitude (`gs_takeoff_altitude`, suffix `m`), Δ (`gs_takeoff_delta`, suffix `m`), R (`gs_formation_radius`), H (`gs_formation_heading`), Dest X (`gs_goto_x`), Dest Y (`gs_goto_y`). Do not show Takeoff / Make Formation / Goto / Land / Restart latches.
- Mission labels, index = wire id, copied from Observation Board `MISSION_LABELS`: `NONE`, `Formation NN`, `Formation Classic`, `Waypoint`, `Velocity`, `Circle`, `Lissajous`, `Tracker`, `Section`, `Spinning`, `Sine Input`, `Cylinder Homing`. Unknown id displays the decimal id. `0` is `NONE`, a real value.
- Empty CSV cell is missing (`null`). The number `0` is a real value for every numeric field, including mission type, Δ, H, X, and Y.
- Values are sticky. A field stays at its last commanded value until a later `obs` row changes it. A command issued before ARM (negative experiment time) is already in effect at T=0. A command issued at T=10 is not visible at T=9.
- Time anchor is the first CSV row with `armed` in `1` / `"1"` / `true`. Prefer `manifest.sync.main_drone_id` when that drone has such a row; otherwise the lowest numeric `drone_id` that does; otherwise any drone. If no armed row exists, `arm_recv_s` is null and the first command row is T=0. Manual drone offsets do not move this swarm timeline (the main drone’s offset is already 0).
- One active log. `obs_*.csv` means the filename matches `obs_*.csv` (prefix `obs_`, suffix `.csv`). Copied to `raw/observation/`, append-only UTC suffix on name collision. `manifest.observation` is a one-element list of the experiment-relative path. A directory with several such files still copies all of them; the active path is the lexicographically last filename. Importing one file makes that file active. An `obs` file is never `needs_id` and never stored under `raw/drone_<id>/`, even when Import was opened on a drone row.
- No observation log is valid. Rebuild still succeeds. `pose.mission` is `null`. The Mission block is not rendered.
- Plot channel id is `ob.ob.command.<column>` with `<column>` the CSV name above (`mission_type` is the integer id). Series is a zero-order hold (flat segments, duplicate timestamp at each change), extended to `sync.json` `t_max_s` when that is later than the last change. Do not linearly interpolate between command times. `experiment_t_max_s` includes the last command’s experiment time.
- The panel is read-only. It sits in the Analysis `w-56` column immediately after `MarkerPanel`. It re-renders from `pose.mission` when T changes. Null fields render `—`.
- TDD: write the failing test, run it and record the failure, then the minimum code, then run it and record the pass. Implementers do not dispatch subagents. Do not `git commit`. Do not bind 6500/6573. Do not send ground-station commands.
- Implementers and reviewers use Grok non-fast only.
- Backend: `cd web/backend && .venv/bin/python -m pytest <file> -v` while iterating; `cd web/backend && .venv/bin/python -m pytest` (`not e2e`) once before a task is handed to review. Frontend: `cd web/frontend && npx vitest run <file>` then `npx vitest run`.
- Version bump is `0.84.0` in Task 7 only. No other new markdown.

## Execution waves

Disjoint files inside a wave run as parallel implementers. Reviewers for that wave start only after every implementer in the wave has reported RED and GREEN. The next wave starts only after those reviewers approve. Then one whole-branch reviewer.

| Wave | Tasks in parallel | Owns |
|---|---|---|
| 1 | 1, 2, 3 | `extract_ob.py`, `mission_command.py`, `MissionPanel.tsx` |
| 2 | 4, 5, 6 | ingest/rebuild, series/topics/duration, `pose.py` |
| 3 | 7 | `App.tsx`, `api.ts`, `plotBoard.ts`, README, UPDATES |

## Review Focus

- A command before ARM must still show at T=0, and a later change must not show early. Task 2 `test_hold_includes_pre_arm_and_hides_future`.
- The digit `0` must not become blank or `NONE` except mission type 0, which is the label `NONE`. Task 2 `test_zero_is_a_value`.
- An `obs_*.csv` imported from a drone row must not become `needs_id` or land in `raw/drone_*`. Task 4 `test_obs_csv_is_swarm_level`.
- Plot samples of Vmax must stay flat across a gap and jump at the change time. Task 5 `test_ob_series_is_a_step`.
- An experiment with no `obs` log still rebuilds, `pose.mission` is null, and Analysis has no Mission heading. Task 6 `test_pose_mission_null_without_log` and Task 7 `hides the mission block when pose has no mission`.

## File map

- Create: `web/backend/ea/extract_ob.py`, `web/backend/ea/mission_command.py`
- Create: `web/backend/tests/test_extract_ob.py`, `web/backend/tests/test_mission_command.py`, `web/backend/tests/test_ob_series.py`, `web/backend/tests/test_ingest_ob.py`
- Modify: `web/backend/ea/ingest_files.py`, `web/backend/ea/rebuild.py`, `web/backend/ea/series.py`, `web/backend/ea/topics.py`, `web/backend/ea/duration.py`, `web/backend/ea/pose.py`
- Create: `web/frontend/src/components/MissionPanel.tsx`, `web/frontend/src/components/MissionPanel.test.tsx`
- Modify: `web/frontend/src/api.ts`, `web/frontend/src/App.tsx`, `web/frontend/src/App.test.tsx`, `web/frontend/src/plotBoard.ts`, `web/frontend/src/plotBoard.test.ts`
- Modify: `README.md`, `UPDATES.md`

---

### Task 1: Extract command changes and the ARM anchor

**Files:**
- Create: `web/backend/ea/extract_ob.py`
- Test: `web/backend/tests/test_extract_ob.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `COMMAND_COLUMNS: tuple[str, ...]` = `("mission_type", "gs_goto_speed", "gs_takeoff_altitude", "gs_takeoff_delta", "gs_formation_radius", "gs_formation_heading", "gs_goto_x", "gs_goto_y")`
  - `extract_ob(csv_path: Path, dest_dir: Path, main_drone_id: int | None = None) -> Path | Literal["skipped"]`
  - Writes `dest_dir/command.parquet` with `t_recv_s` plus `COMMAND_COLUMNS` (nullable floats; `mission_type` is a nullable integer). One row each time any column changes. Forward-fill within the file so a row that sets only Vmax keeps the previous radius.
  - Writes `dest_dir/anchor.json` `{"arm_recv_s": float | null}` on every non-skipped extract.
  - Returns the parquet path, or `"skipped"` when the file has no command-field value (no parquet, no anchor).

- [ ] **Step 1: Write the failing test**

`tests/test_extract_ob.py` builds a CSV with the real Observation Board header subset `recv_time_s,kind,drone_id,armed,mission_type,gs_goto_speed,gs_formation_radius,gs_goto_x,gs_goto_y` plus the other `COMMAND_COLUMNS` present and empty:

1. `recv_time_s=1000`, `kind=gs_control`, `mission_type=0`, `gs_goto_speed=1`, other command cells empty.
2. `recv_time_s=1001`, `kind=drone_update`, `drone_id=2`, `armed=1`, command cells empty (hold must not emit a second row).
3. `recv_time_s=1010`, `kind=gs_control`, `gs_goto_speed=3`, `gs_formation_radius=2`, `gs_goto_x=0.5`, `gs_goto_y=0`.

```python
def test_extract_emits_changes_and_arm_anchor(tmp_path: Path):
    csv_path = tmp_path / "obs_20261026_100000z.csv"
    csv_path.write_text(CSV, encoding="utf-8")
    out = extract_ob(csv_path, tmp_path / "derived", main_drone_id=4)
    df = pd.read_parquet(out)
    assert list(df["t_recv_s"]) == [1000.0, 1010.0]
    assert df.loc[0, "mission_type"] == 0
    assert df.loc[0, "gs_goto_speed"] == 1.0
    assert pd.isna(df.loc[0, "gs_formation_radius"])
    assert df.loc[1, "gs_goto_speed"] == 3.0
    assert df.loc[1, "gs_formation_radius"] == 2.0
    assert df.loc[1, "gs_goto_x"] == 0.5
    assert df.loc[1, "gs_goto_y"] == 0.0
    assert df.loc[1, "mission_type"] == 0
    anchor = json.loads((tmp_path / "derived" / "anchor.json").read_text())
    assert anchor["arm_recv_s"] == 1001.0


def test_arm_anchor_prefers_main_drone(tmp_path: Path):
    # drone 2 arms at recv 1000, drone 4 arms at recv 1005; main_drone_id=4
    assert json.loads((dest / "anchor.json").read_text())["arm_recv_s"] == 1005.0


def test_extract_skips_header_only(tmp_path: Path):
    assert extract_ob(header_only, tmp_path / "derived") == "skipped"
    assert not (tmp_path / "derived" / "command.parquet").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_extract_ob.py -v`

Expected: FAIL, `extract_ob` not defined.

- [ ] **Step 3: Implement `extract_ob`**

Read with `csv.DictReader`. Parse `recv_time_s` as float. Treat a command cell as missing when it is `""` or the column is absent. `mission_type` parses as `int`; other columns as `float`. Scan armed rows for the anchor before emitting. Emit a row only when the forward-filled tuple changes and at least one column is non-null. Create `dest_dir` if needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_extract_ob.py -v`

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 2: Hold-last mission snapshot at experiment time

**Files:**
- Create: `web/backend/ea/mission_command.py`
- Test: `web/backend/tests/test_mission_command.py`

**Interfaces:**
- Consumes: Task 1 parquet and `anchor.json` layout (fixture them in this task; do not import `extract_ob`)
- Produces:
  - `MISSION_LABELS: tuple[str, ...]` the 12 labels in Global Constraints
  - `mission_at(experiment_dir: Path, t: float) -> dict | None`
  - Returns `None` when `derived/observation/command.parquet` is missing.
  - Otherwise a dict with keys `mission_type: int | None`, `mission_label: str | None`, `vmax`, `altitude_m`, `delta_m`, `radius_m`, `heading_deg`, `dest_x_m`, `dest_y_m` (`float | None`).
  - Experiment time of a row is `t_recv_s - arm_recv_s` when `anchor.json` has a number, else `t_recv_s - first t_recv_s`.
  - Select the last row with experiment time `<= t`. Rows before that still contribute their held values. If `t` is before every row, return the dict with every value `None`.

- [ ] **Step 1: Write the failing test**

Fixture parquet rows at `t_recv_s` 995 and 1010, `anchor.json` `arm_recv_s=1000` (so experiment times −5 and 10):

| t_recv_s | mission_type | gs_goto_speed | gs_formation_radius | gs_goto_x | gs_goto_y | gs_takeoff_delta |
|---|---|---|---|---|---|---|
| 995 | 0 | 1 | null | null | null | 0 |
| 1010 | 0 | 3 | 2 | 0.5 | 0 | 0 |

```python
def test_hold_includes_pre_arm_and_hides_future(tmp_path: Path):
    at0 = mission_at(tmp_path, 0.0)
    assert at0["mission_label"] == "NONE"
    assert at0["vmax"] == 1.0
    assert at0["delta_m"] == 0.0
    assert at0["radius_m"] is None
    assert at0["dest_x_m"] is None
    later = mission_at(tmp_path, 10.0)
    assert later["vmax"] == 3.0
    assert later["radius_m"] == 2.0
    assert later["dest_x_m"] == 0.5
    assert later["dest_y_m"] == 0.0
    early = mission_at(tmp_path, 9.0)
    assert early["vmax"] == 1.0
    assert early["radius_m"] is None


def test_zero_is_a_value(tmp_path: Path):
    snap = mission_at(tmp_path, 10.0)
    assert snap["mission_type"] == 0
    assert snap["mission_label"] == "NONE"
    assert snap["delta_m"] == 0.0
    assert snap["dest_y_m"] == 0.0


def test_missing_parquet_is_none(tmp_path: Path):
    assert mission_at(tmp_path, 0.0) is None


def test_before_first_command_is_blank(tmp_path: Path):
    # single row at experiment time 10, no anchor shift (arm_recv_s null, first row is T=0)
    # use a row whose t_recv is 10 and arm 0 so this case is "t before first": arm_recv_s=0, row at 10, query t=-1
    blank = mission_at(tmp_path, -1.0)
    assert blank["vmax"] is None
    assert blank["mission_label"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_mission_command.py -v`

Expected: FAIL, `mission_at` not defined.

- [ ] **Step 3: Implement `mission_at`**

Map columns to the JSON keys listed above. Use the last row with `t_exp <= t` (`searchsorted`, side right, minus one). Missing anchor file means `arm_recv_s` null. pandas NA becomes `None`. Label is `MISSION_LABELS[mission_type]` when the index exists, else `str(mission_type)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_mission_command.py -v`

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 3: Read-only mission block

**Files:**
- Create: `web/frontend/src/components/MissionPanel.tsx`
- Test: `web/frontend/src/components/MissionPanel.test.tsx`

**Interfaces:**
- Consumes: the `mission_at` JSON shape from Task 2 (define the same type here; Task 7 re-exports it from `api.ts`)
- Produces: `MissionSnapshot` and `export default function MissionPanel({ mission }: { mission: MissionSnapshot | null })`. `mission === null` renders nothing (`null`). Otherwise a section headed `Mission` with text, not inputs:
  - mission label, or `—`
  - `Vmax` then the number
  - altitude, suffix `m`; `Δ`, suffix `m`
  - `R`; `H`
  - `Dest` then `X` and `Y`
  - null numbers render `—`. `0` and `0.5` render as `0` and `0.5`.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders the command fields and updates when the snapshot changes", () => {
  const { rerender } = render(
    <MissionPanel
      mission={{
        mission_type: 0,
        mission_label: "NONE",
        vmax: 1,
        altitude_m: 1,
        delta_m: 0,
        radius_m: 2,
        heading_deg: 0,
        dest_x_m: 0.5,
        dest_y_m: 0,
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: "Mission" })).toBeInTheDocument();
  expect(screen.getByText("NONE")).toBeInTheDocument();
  expect(screen.getByLabelText("Vmax")).toHaveTextContent("1");
  expect(screen.getByLabelText("Δ")).toHaveTextContent("0 m");
  expect(screen.getByLabelText("R")).toHaveTextContent("2");
  expect(screen.getByLabelText("Dest X")).toHaveTextContent("0.5");
  expect(screen.getByLabelText("Dest Y")).toHaveTextContent("0");
  rerender(
    <MissionPanel
      mission={{
        mission_type: 1,
        mission_label: "Formation NN",
        vmax: 3,
        altitude_m: 1,
        delta_m: 0,
        radius_m: 4,
        heading_deg: 0,
        dest_x_m: 0.5,
        dest_y_m: 1,
      }}
    />,
  );
  expect(screen.getByText("Formation NN")).toBeInTheDocument();
  expect(screen.getByLabelText("Vmax")).toHaveTextContent("3");
  expect(screen.getByLabelText("R")).toHaveTextContent("4");
  expect(screen.getByLabelText("Dest Y")).toHaveTextContent("1");
});

it("renders nothing without a log", () => {
  const { container } = render(<MissionPanel mission={null} />);
  expect(container).toBeEmptyDOMElement();
});

it("renders a dash for a field not commanded yet", () => {
  render(
    <MissionPanel
      mission={{
        mission_type: null,
        mission_label: null,
        vmax: null,
        altitude_m: null,
        delta_m: null,
        radius_m: null,
        heading_deg: null,
        dest_x_m: null,
        dest_y_m: null,
      }}
    />,
  );
  expect(screen.getByLabelText("Vmax")).toHaveTextContent("—");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/frontend && npx vitest run src/components/MissionPanel.test.tsx`

Expected: FAIL, module not found.

- [ ] **Step 3: Implement `MissionPanel`**

Match the existing marker card: `rounded border border-zinc-800 p-3 text-sm`, heading `mb-2 font-medium`. Put `aria-label` on each value node (`Vmax`, `altitude`, `Δ`, `R`, `H`, `Dest X`, `Dest Y`). Altitude and Δ append ` m` only when the number is present.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web/frontend && npx vitest run src/components/MissionPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 4: Import and rebuild the observation log

**Files:**
- Modify: `web/backend/ea/ingest_files.py` (`_file_kind`, `import_paths`)
- Modify: `web/backend/ea/rebuild.py` (after the drone loop, before `experiment_t_max_s`)
- Test: `web/backend/tests/test_ingest_ob.py`

**Interfaces:**
- Consumes: `extract_ob(csv_path, dest_dir, main_drone_id) -> Path | "skipped"` from Task 1
- Produces: `manifest["observation"]` is `["raw/observation/<file>"]` or absent. Rebuild writes `derived/observation/` by calling `extract_ob` on the first existing manifest path. `main_drone_id` comes from `manifest["sync"]["main_drone_id"]` when it is an int. A missing or skipped log does not fail rebuild.

- [ ] **Step 1: Write the failing test**

```python
def test_obs_csv_is_swarm_level(tmp_path, monkeypatch):
    # import_paths(slug, [folder], drone_id=2) where folder has
    # Group3RLcat2_log_1.ulg (use the existing min ulog helper if needed)
    # and obs_20261026_100000z.csv plus obs_20261026_090000z.csv
    assert result["needs_id"] == []
    assert (exp / "raw" / "observation" / "obs_20261026_100000z.csv").is_file()
    assert (exp / "raw" / "observation" / "obs_20261026_090000z.csv").is_file()
    assert not list((exp / "raw" / "drone_2").glob("obs_*.csv"))
    assert manifest["observation"] == ["raw/observation/obs_20261026_100000z.csv"]


def test_single_file_import_becomes_active(tmp_path, monkeypatch):
    # import only obs_20261026_090000z.csv
    assert manifest["observation"] == ["raw/observation/obs_20261026_090000z.csv"]


def test_rebuild_extracts_observation(tmp_path, monkeypatch):
    # after import of a csv that contains one gs_control gs_goto_speed=1
    rebuild(slug)
    assert (exp / "derived" / "observation" / "command.parquet").is_file()
```

Use the same experiment-dir monkeypatch the other ingest tests use (`EA_EXPERIMENTS_DIR` / `paths.experiments_dir`). A header-only `obs` csv still imports; rebuild leaves no parquet and returns `ok`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_ingest_ob.py -v`

Expected: FAIL, `obs` file ignored or listed in `needs_id`.

- [ ] **Step 3: Implement import and rebuild**

`_file_kind` returns `"ob"` for `obs_*.csv` before the system-manager CSV test. In `import_paths`, handle `kind == "ob"` before drone-id resolution: copy into `raw/observation/`, remember the relative path, do not touch `needs_id`. After the file loop, if any ob path was copied, set `manifest["observation"]` to a one-element list of the lexicographically last copied name when several arrived, or the only copied file. Rebuild reads that list, calls `extract_ob`, and ignores `"skipped"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_ingest_ob.py -v`

Expected: PASS. Then `cd web/backend && .venv/bin/python -m pytest tests/test_ingest_files.py tests/test_needs_id.py -v` so existing SM/HA import still passes.

- [ ] **Step 5: Do not commit**

---

### Task 5: Plot channels are steps on the experiment clock

**Files:**
- Modify: `web/backend/ea/series.py` (`_SOURCE_PARQUET_DIRS`, `_parse_channel`, `_load_channel_series`, `channel_value_at_t`)
- Modify: `web/backend/ea/topics.py` (`list_topics`)
- Modify: `web/backend/ea/duration.py` (`experiment_t_max_s`)
- Test: `web/backend/tests/test_ob_series.py`

**Interfaces:**
- Consumes: `derived/observation/command.parquet` and `anchor.json` from Task 1. Does not call `mission_at`.
- Produces:
  - `list_topics` includes `"ob": {"ob": {"command": [columns that exist]}}` only when the parquet exists. Columns keep CSV names. `t_recv_s` is not a field.
  - `series(..., ["ob.ob.command.gs_goto_speed"])` returns experiment-time samples. For change points `(t_i, y_i)` and end `t_end = max(t_max_s, t_last)`, emit `(t_0, y_0), (t_1, y_0), (t_1, y_1), ... , (t_end, y_last)`. Skip leading nulls for that column. `t_max_s` is the top-level value in `derived/sync.json` when present.
  - `channel_value_at_t` for an `ob` channel is the held value at `t` (not `interp_scalar`). `None` before the first non-null sample.
  - `experiment_t_max_s` is at least the last command experiment time when that parquet exists. A missing log leaves duration unchanged.

- [ ] **Step 1: Write the failing test**

Same two-row fixture as Task 2 (Vmax 1 at experiment time −5, Vmax 3 at experiment time 10). Write `derived/sync.json` `{"t_max_s": 20, "drones": {}}` and an empty manifest with no drones so duration has no ulog.

```python
def test_ob_series_is_a_step(tmp_path: Path):
    out = series(tmp_path, ["ob.ob.command.gs_goto_speed"])
    assert out["ob.ob.command.gs_goto_speed"]["t"] == [-5.0, 10.0, 10.0, 20.0]
    assert out["ob.ob.command.gs_goto_speed"]["y"] == [1.0, 1.0, 3.0, 3.0]


def test_ob_value_at_t_holds(tmp_path: Path):
    assert channel_value_at_t(tmp_path, "ob.ob.command.gs_goto_speed", 0.0) == 1.0
    assert channel_value_at_t(tmp_path, "ob.ob.command.gs_goto_speed", 10.0) == 3.0


def test_topics_list_ob_command_fields(tmp_path: Path):
    tree = list_topics(tmp_path)
    assert "gs_goto_speed" in tree["ob"]["ob"]["command"]
    assert "t_recv_s" not in tree["ob"]["ob"]["command"]


def test_duration_includes_last_command(tmp_path: Path):
    assert experiment_t_max_s(tmp_path) == 10.0
```

The duration fixture has no `sync.json` `t_max_s` yet (duration computes it). The series fixture may write `t_max_s` itself. Keep those two fixtures separate so duration does not read its own output.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_ob_series.py -v`

Expected: FAIL, empty series or unknown source.

- [ ] **Step 3: Implement the ob source**

`_SOURCE_PARQUET_DIRS["ob"]` ignores `drone_id` and returns `experiment_dir / "derived" / "observation"`. `_parse_channel` already accepts source `ob` once that key exists (`ob.ob.command.gs_goto_speed` → drone `ob`, source `ob`, topic `command`, field `gs_goto_speed`). Convert `t_recv_s` with the anchor rule from Task 2. Build the step samples in `_load_channel_series` only for source `ob`. `channel_value_at_t` uses last `t_i <= t` for source `ob` instead of `interp_scalar`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_ob_series.py tests/test_series.py tests/test_duration.py -v`

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 6: Pose carries the mission snapshot

**Files:**
- Modify: `web/backend/ea/pose.py` (`pose_at` return dict)
- Test: `web/backend/tests/test_mission_command.py` (add the pose cases; do not duplicate `mission_at` tests)

**Interfaces:**
- Consumes: `mission_at(experiment_dir, t) -> dict | None` from Task 2
- Produces: `pose_at(...)["mission"]` is that dict or `None`. Existing keys `t`, `origin`, `drones` stay.

- [ ] **Step 1: Write the failing test**

Add to `test_mission_command.py`, using the Task 2 fixture directory and a minimal `manifest.json` (`version`, `name`, `drones: []`, `sync`, `ui`) so `pose_at` can load it:

```python
def test_pose_includes_mission_at_t(tmp_path: Path):
    pose = pose_at(tmp_path, 0.0)
    assert pose["mission"]["vmax"] == 1.0
    assert pose_at(tmp_path, 10.0)["mission"]["vmax"] == 3.0


def test_pose_mission_null_without_log(tmp_path: Path):
    # manifest only, no derived/observation
    assert pose_at(tmp_path, 0.0)["mission"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_mission_command.py::test_pose_includes_mission_at_t tests/test_mission_command.py::test_pose_mission_null_without_log -v`

Expected: FAIL, key `mission` missing.

- [ ] **Step 3: Implement the pose field**

Call `mission_at` once at the end of `pose_at` and set `"mission"` on the returned dict.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_mission_command.py tests/test_pose.py -v`

Expected: PASS.

- [ ] **Step 5: Do not commit**

---

### Task 7: Show the snapshot under the markers and in the plot picker

**Files:**
- Modify: `web/frontend/src/api.ts` (`PoseResponse`)
- Modify: `web/frontend/src/App.tsx` (the `w-56` column)
- Modify: `web/frontend/src/App.test.tsx`
- Modify: `web/frontend/src/plotBoard.ts` (`topicsToChannelTree`)
- Modify: `web/frontend/src/plotBoard.test.ts`
- Modify: `README.md` (ingest row, Analysis UI bullet, channel-id sentence)
- Modify: `UPDATES.md` (new top entry `0.84.0`)

**Interfaces:**
- Consumes: `MissionPanel` and `MissionSnapshot` from Task 3. `PoseResponse["mission"]` matches Task 6. Topics tree key `ob` from Task 5. Channel ids stay `ob.ob.command.<field>`.
- Produces: Analysis renders `<MissionPanel mission={pose?.mission ?? null} />` as the next child after `<MarkerPanel />` inside `div.w-56`. The channel tree root `ob` is a single folder labeled `Mission` whose leaves are the fields. Leaf labels: `mission_type` → `mission type`, `gs_goto_speed` → `Vmax`, `gs_takeoff_altitude` → `altitude m`, `gs_takeoff_delta` → `Δ m`, `gs_formation_radius` → `R`, `gs_formation_heading` → `H`, `gs_goto_x` → `Dest X`, `gs_goto_y` → `Dest Y`. Leaf ids are unchanged.

- [ ] **Step 1: Write the failing test**

In `App.test.tsx`, extend the mocked `getPose` resolution inside one test (do not change the default mock used by other tests except adding `mission` only in these cases):

```tsx
it("places the mission block under Markers and follows pose", async () => {
  vi.mocked(getPose).mockResolvedValue({
    t: 0,
    origin: { lat: 0, lon: 0, alt_m: 0 },
    drones: {},
    mission: {
      mission_type: 0,
      mission_label: "NONE",
      vmax: 1,
      altitude_m: 1,
      delta_m: 0,
      radius_m: 2,
      heading_deg: 0,
      dest_x_m: 0.5,
      dest_y_m: 0,
    },
  });
  const panel = await openAnalysis();
  const markers = within(panel).getByRole("heading", { name: "Markers" });
  const mission = within(panel).getByRole("heading", { name: "Mission" });
  expect(follows(markers, mission)).toBe(true);
  expect(within(panel).getByLabelText("Vmax")).toHaveTextContent("1");
});

it("hides the mission block when pose has no mission", async () => {
  const panel = await openAnalysis();
  expect(within(panel).queryByRole("heading", { name: "Mission" })).toBeNull();
});
```

In `plotBoard.test.ts`:

```ts
it("lists observation command fields under Mission", () => {
  const tree = topicsToChannelTree({
    ob: {
      ob: {
        command: ["gs_goto_speed", "gs_formation_radius", "gs_goto_x"],
      },
    },
  });
  expect(tree).toEqual([
    {
      id: "ob",
      label: "Mission",
      children: [
        { id: "ob.ob.command.gs_goto_x", label: "Dest X" },
        { id: "ob.ob.command.gs_formation_radius", label: "R" },
        { id: "ob.ob.command.gs_goto_speed", label: "Vmax" },
      ],
    },
  ]);
});
```

Leaves sort by those labels (`Dest X`, `R`, `Vmax`). Ids stay `ob.ob.command.<column>`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/frontend && npx vitest run src/App.test.tsx src/plotBoard.test.ts`

Expected: FAIL, no Mission heading, and the `ob` node is still labeled `ob` with nested source/topic folders.

- [ ] **Step 3: Implement the wiring**

Add `mission?: MissionSnapshot | null` on `PoseResponse` in `api.ts`. Import `MissionSnapshot` from `MissionPanel` (or move the type to `api.ts` and import it from the panel — one definition). Pass `pose?.mission ?? null`. In `topicsToChannelTree`, when `drone === "ob"`, skip the source/topic levels and emit the field leaves with the labels above, sorted by label.

README: Files ingest recognizes `obs_*.csv` as a swarm observation log (`raw/observation/`, `manifest.observation`). Analysis shows those command fields under Markers at T. Channel ids include `ob.ob.command.<field>`. `UPDATES.md` top entry `0.84.0 - Observation Board command panel` with one line for the panel, one line for time hold, one line for plot channels.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web/frontend && npx vitest run`

Expected: PASS.

Run: `cd web/backend && .venv/bin/python -m pytest`

Expected: PASS (`not e2e`).

- [ ] **Step 5: Do not commit**

---

## Self-review

- Spec coverage: import, time-varying panel under markers, hold across T, plot access, missing log. Each has a task.
- Waves 1–2 share only the interfaces above. Task 7 waits for the panel, the pose field, and the topics key.
- `mission_at` keys match `MissionSnapshot` and `pose["mission"]`.
- Review Focus items each have a named test.
- No commit steps. No new markdown besides this plan and the README/UPDATES edits in Task 7.
