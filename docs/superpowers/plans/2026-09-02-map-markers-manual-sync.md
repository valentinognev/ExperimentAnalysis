# 2D markers + manual sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 2D current-T pose markers use the same shapes as 3D, and add ARM vs Manual time-sync on the Analysis tab so operators without an ARM event can pick a main drone and offset the others.

**Architecture:** 2D `scattermap` stops using Maki names that do not match scatter3d (`square-stroked`, `cross`). Circle/square stay map markers; hollow square and x are text glyphs. Sync: `manifest.sync.mode` `"arm"` | `"manual"`. ARM ignores `manual_offsets_s` and uses ulog/SM ARM. Manual nulls ARM anchors (first sample is T=0) and applies offsets. UI toggle sits to the right of the Analysis `Drones` label.

**Tech Stack:** FastAPI / pytest; React 19, TypeScript, Vitest, Testing Library, Plotly scattermap / scatter3d.

**Spec:** Approved in-chat design 2026-09-02 (no separate spec file). Binding decisions are the Global Constraints below.

## Global Constraints

- 2D current-T pose markers match 3D/Cesium geometry: EKF filled circle with black ring, GPS filled square, SM NED hollow square, SM LLA x. Ground diamonds unchanged.
- Plotly `scattermap` has no `square-open` / `x` Maki icons. Do not use `square-stroked` or `cross` (Maki `cross` is a plus). Circle and square stay `scattermap` markers; `square-open` and `x` are `mode: "text"` glyphs `□` and `✕`.
- `avatarMarkerStyle(k).mapSymbol === avatarMarkerStyle(k).symbol` for every avatar key.
- Sync modes: `"arm"` (default) and `"manual"`. Stored in `manifest.sync.mode`.
- ARM mode: current T mapping (ulog ARM / SM ARM / first-sample fallback). `manual_offsets_s` is ignored (effective offset 0). Unsynced ARM banner still shows.
- Manual mode: ARM timestamps ignored (`ulog_arm_us` / `sm_arm_local_ts` treated as None). T = first-sample-relative + offset. Main physical drone offset is 0. Positive Δt shifts that drone later on the shared timeline. Hide the ARM unsynced banner.
- Replay ids inherit the parent’s offset (`ea.sync.manual_offset_s` already does this). Main picker and offset fields are physical drones only.
- Spatial origin / NED reference LLA do not follow time offsets. ARM origin stays GPS-at-ARM. Manual origin uses first GPS sample per physical drone (because ARM is ignored).
- PATCH `{sync: {mode, main_drone_id, manual_offsets_s}}` then refetch pose / trajectory / series / duration via existing `refreshToken`. No rebuild.
- Switching main rebases offsets: `new[i] = old[i] - old[newMain]`, `new[newMain] = 0`.
- Toggle is on the Analysis `Drones` header row, to the right of the “Drones” label. Sources variant has no toggle.
- TDD: failing test first, watch it fail, then minimal code. Record RED/GREEN in the implementer report.
- Work only in this worktree/branch (`feat/map-markers-manual-sync`). Do not touch the user’s dirty files on `main`.
- Backend tests: `cd web/backend && .venv/bin/python -m pytest` (focused file while iterating; full `not e2e` suite once before commit). Frontend: `cd web/frontend && npx vitest run` similarly.
- Version: committed `UPDATES.md` HEAD is `0.80.2`; this feature is `0.81.0`. Fold README/UPDATES into Task 3.
- Do not create markdown other than README.md / UPDATES.md edits required by Task 3.
- Implementers never dispatch subagents or reviewers.
- Do not bind 6500/6573. No GS commands.

## File map

- Modify: `web/frontend/src/avatarMarker.ts`, `web/frontend/src/map2d.ts`
- Test: `web/frontend/src/avatarMarker.test.ts`, `web/frontend/src/map2d.test.ts`
- Modify: `web/backend/ea/sync.py`, `web/backend/ea/pose.py`, `web/backend/ea/series.py`, `web/backend/ea/duration.py`, `web/backend/ea/trajectory.py`
- Test: `web/backend/tests/test_sync.py`, `web/backend/tests/test_manual_offset.py`
- Create: `web/frontend/src/syncMode.ts`, `web/frontend/src/syncMode.test.ts`
- Modify: `web/frontend/src/components/DroneList.tsx`, `web/frontend/src/App.tsx`
- Test: `web/frontend/src/components/DroneList.test.tsx`, `web/frontend/src/App.test.tsx`
- Modify: `README.md`, `UPDATES.md`

---

### Task 1: 2D pose markers match 3D shapes

**Files:**
- Modify: `web/frontend/src/avatarMarker.ts`
- Modify: `web/frontend/src/map2d.ts` (`currentPointTraces`)
- Test: `web/frontend/src/avatarMarker.test.ts`
- Test: `web/frontend/src/map2d.test.ts`

**Interfaces:**
- Consumes: existing `avatarMarkerStyle`, `mapFigure` / `MapPoint.symbol`
- Produces: `mapSymbol` equals 3D `symbol`; `currentPointTraces` draws `square-open` as text `□` and `x` as text `✕`; circle/square/diamond unchanged (EKF halo remains)

- [ ] **Step 1: Write the failing tests**

In `avatarMarker.test.ts`, change `uses the same shape family on the map as in 3D` so `mapSymbol` equals `symbol`:

```typescript
it("uses the same shape family on the map as in 3D", () => {
  expect(avatarMarkerStyle("ekf_ned")).toMatchObject({
    symbol: "circle",
    mapSymbol: "circle",
    halo: true,
  });
  expect(avatarMarkerStyle("gps")).toMatchObject({
    symbol: "square",
    mapSymbol: "square",
  });
  expect(avatarMarkerStyle("sm_ned")).toMatchObject({
    symbol: "square-open",
    mapSymbol: "square-open",
  });
  expect(avatarMarkerStyle("sm_lla")).toMatchObject({
    symbol: "x",
    mapSymbol: "x",
  });
});

it("mapSymbol equals the 3D symbol for every avatar", () => {
  for (const key of AVATAR_KEYS) {
    const s = avatarMarkerStyle(key);
    expect(s.mapSymbol).toBe(s.symbol);
  }
});
```

In `map2d.test.ts` add:

```typescript
it("draws sm ned as a hollow-square glyph and sm lla as an x glyph", () => {
  const { data } = mapFigure(
    [
      {
        lat: 32,
        lon: 35,
        name: "D2 sm ned",
        color: "#f00",
        symbol: "square-open",
      },
      {
        lat: 32.1,
        lon: 35.1,
        name: "D2 sm lla",
        color: "#f00",
        symbol: "x",
      },
    ],
    [],
  );
  type T = {
    name?: string;
    mode?: string;
    text?: string[];
    marker?: { symbol?: string };
  };
  const ned = data.find((t) => (t as T).name === "D2 sm ned") as T;
  const lla = data.find((t) => (t as T).name === "D2 sm lla") as T;
  expect(ned?.mode).toContain("text");
  expect(ned?.text).toEqual(["□"]);
  expect(ned?.marker?.symbol).not.toBe("square-stroked");
  expect(lla?.mode).toContain("text");
  expect(lla?.text).toEqual(["✕"]);
  expect(lla?.marker?.symbol).not.toBe("cross");
});

it("lists hollow-square and x pose markers in the legend", () => {
  const { data } = mapFigure(
    [
      {
        lat: 32,
        lon: 35,
        name: "D2 sm ned",
        color: "#f00",
        symbol: "square-open",
      },
      {
        lat: 32.1,
        lon: 35.1,
        name: "D2 sm lla",
        color: "#f00",
        symbol: "x",
      },
    ],
    [],
  );
  type T = { name?: string; showlegend?: boolean };
  const legend = data.filter((t) => (t as T).showlegend !== false) as T[];
  expect(legend.some((t) => t.name === "D2 sm ned")).toBe(true);
  expect(legend.some((t) => t.name === "D2 sm lla")).toBe(true);
});
```

Keep existing EKF halo / GPS square / diamond tests. They must still pass.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web/frontend && npx vitest run src/avatarMarker.test.ts src/map2d.test.ts`

Expected: FAIL — `mapSymbol` still `square-stroked` / `cross`; no text glyphs for `square-open` / `x`.

- [ ] **Step 3: Minimal implementation**

`avatarMarker.ts` STYLES:

```typescript
sm_ned: { symbol: "square-open", mapSymbol: "square-open", size: 8 },
sm_lla: { symbol: "x", mapSymbol: "x", size: 4 },
```

In `map2d.ts` `currentPointTraces`, before the generic marker push, if `symbol === "square-open"` or `symbol === "x"`:

```typescript
const MAP_TEXT_GLYPH: Record<string, string> = {
  "square-open": "□",
  x: "✕",
};
```

Push a `scattermap` trace with `mode: "text"`, `text: [glyph]`, `textfont: { size: MAP_MARKER_SIZE, color }`, `showlegend: true`. Skip Maki `marker.symbol` for those two. Circle (with optional halo), square, and diamond stay as they are.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web/frontend && npx vitest run src/avatarMarker.test.ts src/map2d.test.ts`

Expected: PASS. Then full `npx vitest run` once before commit.

- [ ] **Step 5: Commit**

```bash
git add web/frontend/src/avatarMarker.ts web/frontend/src/avatarMarker.test.ts web/frontend/src/map2d.ts web/frontend/src/map2d.test.ts
git commit -m "$(cat <<'EOF'
fix: draw 2D pose markers with the same shapes as 3D

scattermap Maki cross/square-stroked did not match scatter3d x/square-open.
EOF
)"
```

---

### Task 2: Backend ARM vs manual time mapping

**Files:**
- Modify: `web/backend/ea/sync.py`
- Modify: `web/backend/ea/pose.py` (`pose_at`, `_compute_origin`; pass mapped arm into interpolators / `_sm_avatars_at`)
- Modify: `web/backend/ea/series.py` (`_load_channel_series` callers must pass mapped arm)
- Modify: `web/backend/ea/duration.py`
- Modify: `web/backend/ea/trajectory.py`
- Test: `web/backend/tests/test_sync.py`
- Test: `web/backend/tests/test_manual_offset.py`

**Interfaces:**
- Consumes: existing `t_ulog` / `t_sm` / `manual_offset_s` / `sync.json` ARM fields
- Produces:
  - `sync_mode(manifest: dict) -> str` — `"manual"` if `manifest["sync"]["mode"] == "manual"`, else `"arm"`
  - `manual_offset_s` returns 0.0 unless `sync_mode` is `"manual"` (replay still inherits parent key)
  - `time_mapping(manifest, sync_info, drone_id) -> tuple[int | None, float | None, float]` → `(ulog_arm_us, sm_arm_local_ts, offset_s)`. Manual: both arms `None`, offset from `manual_offset_s`. ARM: arms from `sync_info`, offset `0.0`.
  - `_gps_lla_first(derived) -> tuple | None` — first GPS row (or equivalent). `_compute_origin` uses it when mode is manual; ARM path unchanged (`_gps_lla_at_arm` still requires ARM).

- [ ] **Step 1: Write the failing tests**

`test_sync.py` add:

```python
from ea.sync import manual_offset_s, sync_mode, time_mapping


def test_sync_mode_defaults_to_arm():
    assert sync_mode({}) == "arm"
    assert sync_mode({"sync": {}}) == "arm"
    assert sync_mode({"sync": {"mode": "arm"}}) == "arm"
    assert sync_mode({"sync": {"mode": "manual"}}) == "manual"


def test_manual_offset_s_ignored_in_arm_mode():
    manifest = {"sync": {"mode": "arm", "manual_offsets_s": {"2": 1.5}}}
    assert manual_offset_s(manifest, "2") == 0.0
    assert manual_offset_s(manifest, "2_r1") == 0.0


def test_manual_offset_s_applies_in_manual_mode():
    manifest = {"sync": {"mode": "manual", "manual_offsets_s": {"2": 1.5}}}
    assert manual_offset_s(manifest, "2") == 1.5
    assert manual_offset_s(manifest, "2_r1") == 1.5


def test_time_mapping_manual_drops_arm():
    manifest = {"sync": {"mode": "manual", "manual_offsets_s": {"2": 1.5}}}
    arm_us, sm_arm, offset = time_mapping(
        manifest, {"ulog_arm_us": 5000, "sm_arm_local_ts": 10.0}, "2"
    )
    assert arm_us is None
    assert sm_arm is None
    assert offset == 1.5


def test_time_mapping_arm_keeps_arm_zero_offset():
    manifest = {"sync": {"mode": "arm", "manual_offsets_s": {"2": 9.0}}}
    arm_us, sm_arm, offset = time_mapping(
        manifest, {"ulog_arm_us": 5000, "sm_arm_local_ts": 10.0}, "2"
    )
    assert arm_us == 5000
    assert sm_arm == 10.0
    assert offset == 0.0
```

Update existing `test_manual_offset_s_replay_inherits_parent` / `ignores_own_key` / `missing_is_zero` so they set `"mode": "manual"` (otherwise they now expect 0 in ARM).

`test_manual_offset.py`:

- `test_manual_offset_shifts_pose`: set `manifest["sync"]["mode"] = "manual"` **and** change the assertion to first-sample mapping: ARM is ignored, so the pose that used to appear at T=0 (ARM sample) now appears at `t_ulog(5000, None, 1000) + 1.5` = `0.004 + 1.5`. Compare `pose_at(exp, t=0.004)` with no offset vs `pose_at(exp, t=1.504)` with offset 1.5.
- Add `test_arm_mode_ignores_manual_offsets`: same fixture, leave mode `arm`, set offsets `{"2": 1.5}`, `pose_at(t=0)` EKF equals baseline without offsets (ARM still T=0).
- `test_manual_offset_sm_ned_reference_lla_at_arm`: keep ARM mode (offsets ignored); it still asserts spatial ref at ARM.

Add `test_manual_mode_pose_uses_first_sample_not_arm` using `_build_single_drone_fixture`: mode manual, offsets `{}`. `pose_at(t=0)` interpolates the first local-position row only if first_us equals that row; this fixture’s local position starts at 5000 while first timestamp in vehicle_status is 1000. Assert `pose_at(t=0)["drones"]["2"]["present"]` is False (before first local sample) and `pose_at(t=0.004)["drones"]["2"]["present"]` is True — proving ARM (5000 µs) is not T=0. If `present` gating makes t=0.004 flaky, assert EKF at `t=(5000-1000)/1e6` matches the ARM-mode pose at t=0.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_sync.py tests/test_manual_offset.py -v`

Expected: FAIL — `sync_mode` / `time_mapping` missing; `manual_offset_s` still applies in ARM.

- [ ] **Step 3: Minimal implementation**

`ea/sync.py`:

```python
def sync_mode(manifest: dict) -> str:
    mode = manifest.get("sync", {}).get("mode", "arm")
    return "manual" if mode == "manual" else "arm"


def manual_offset_s(manifest: dict, drone_id: object) -> float:
    if sync_mode(manifest) != "manual":
        return 0.0
    offsets = manifest.get("sync", {}).get("manual_offsets_s", {})
    key = str(parent_id(drone_id)) if is_replay_id(drone_id) else str(drone_id)
    return float(offsets.get(key, 0) or 0)


def time_mapping(
    manifest: dict, sync_info: dict, drone_id: object
) -> tuple[int | None, float | None, float]:
    offset_s = manual_offset_s(manifest, drone_id)
    if sync_mode(manifest) == "manual":
        return None, None, offset_s
    arm_us = sync_info.get("ulog_arm_us")
    sm_arm = sync_info.get("sm_arm_local_ts")
    return arm_us, sm_arm, 0.0
```

Wire `time_mapping` in `pose_at`, `_compute_origin` (needs `manifest`; manual → `_gps_lla_first`), `series` / `channel_value_at_t` (pass mapped arm into `_load_channel_series` — either extra args or overwrite a copied `sync_info`), `experiment_t_max_s`, and `trajectory` loop.

`_gps_lla_first`: read GPS parquet, if empty return None, else `_lla_from_row(df.iloc[0])`.

Do not change `t_ulog` / `t_sm` signatures. Passing `arm_us=None` already uses first sample.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_sync.py tests/test_manual_offset.py tests/test_pose.py tests/test_series.py tests/test_duration.py -q`

Expected: PASS. Then full `.venv/bin/python -m pytest` once before commit.

- [ ] **Step 5: Commit**

```bash
git add web/backend/ea/sync.py web/backend/ea/pose.py web/backend/ea/series.py web/backend/ea/duration.py web/backend/ea/trajectory.py web/backend/tests/test_sync.py web/backend/tests/test_manual_offset.py
git commit -m "$(cat <<'EOF'
feat: ARM vs manual experiment-time mapping

Manual mode ignores ARM and applies per-drone offsets; ARM mode ignores offsets.
EOF
)"
```

---

### Task 3: Analysis ARM/Manual toggle and offset fields

**Files:**
- Create: `web/frontend/src/syncMode.ts`
- Create: `web/frontend/src/syncMode.test.ts`
- Modify: `web/frontend/src/components/DroneList.tsx`
- Modify: `web/frontend/src/components/DroneList.test.tsx`
- Modify: `web/frontend/src/App.tsx`
- Modify: `web/frontend/src/App.test.tsx` (hydrate/patch/banner if coverage is missing)
- Modify: `README.md` (Time sync + Analysis UI bullet)
- Modify: `UPDATES.md` (`0.81.0` on top)

**Interfaces:**
- Consumes: Task 2 `manifest.sync.mode` / `main_drone_id` / `manual_offsets_s`; existing `patchManifest`, `refreshToken`
- Produces:
  - `type SyncMode = "arm" | "manual"`
  - `parseSyncMode(raw: unknown): SyncMode`
  - `physicalSyncIds(droneIds: string[]): string[]` — exclude replay ids
  - `rebaseOffsets(offsets: Record<string, number>, newMain: string): Record<string, number>`
  - `parseOffsetInput(raw: string): number | null` — empty/invalid → null (caller ignores)
  - DroneList analysis: ARM | Manual buttons to the right of “Drones”; when Manual, main `<select>` and Δt number fields for other physical drones
  - App hydrates sync from manifest; PATCHes `{sync: {...}}` on change; bumps `refreshToken`; hides unsynced banner when Manual

- [ ] **Step 1: Write the failing tests** `web/frontend/src/syncMode.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseSyncMode,
  physicalSyncIds,
  rebaseOffsets,
  parseOffsetInput,
} from "./syncMode";

describe("parseSyncMode", () => {
  it("defaults to arm", () => {
    expect(parseSyncMode(undefined)).toBe("arm");
    expect(parseSyncMode("nope")).toBe("arm");
    expect(parseSyncMode("manual")).toBe("manual");
  });
});

describe("physicalSyncIds", () => {
  it("drops replay children", () => {
    expect(physicalSyncIds(["2", "2_r1", "3"])).toEqual(["2", "3"]);
  });
});

describe("rebaseOffsets", () => {
  it("zeros the new main and subtracts its old offset", () => {
    expect(rebaseOffsets({ "2": 0, "3": 1.5, "4": -0.5 }, "3")).toEqual({
      "2": -1.5,
      "3": 0,
      "4": -2.0,
    });
  });
});

describe("parseOffsetInput", () => {
  it("parses seconds or rejects junk", () => {
    expect(parseOffsetInput("1.5")).toBe(1.5);
    expect(parseOffsetInput("-0.25")).toBe(-0.25);
    expect(parseOffsetInput("")).toBeNull();
    expect(parseOffsetInput("x")).toBeNull();
  });
});
```

`DroneList.test.tsx` add (analysis variant):

```typescript
it("analysis header has ARM/Manual toggle to the right of Drones", () => {
  render(
    <DroneList
      variant="analysis"
      droneIds={["2", "3"]}
      visible={new Set(["2", "3"])}
      onToggle={() => {}}
      slug="Baseball"
      syncMode="arm"
      onSyncModeChange={() => {}}
    />,
  );
  const drones = screen.getByText("Drones");
  const manual = screen.getByRole("button", { name: "Manual" });
  expect(screen.getByRole("button", { name: "ARM" })).toBeInTheDocument();
  expect(
    drones.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("sources variant has no sync toggle", () => {
  render(
    <DroneList
      variant="sources"
      droneIds={["2"]}
      visible={new Set(["2"])}
      onToggle={() => {}}
      slug="Baseball"
    />,
  );
  expect(screen.queryByRole("button", { name: "ARM" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
});

it("manual mode shows main select and offset fields for others", async () => {
  const user = userEvent.setup();
  const onMainDroneChange = vi.fn();
  const onOffsetChange = vi.fn();
  render(
    <DroneList
      variant="analysis"
      droneIds={["2", "3", "2_r1"]}
      visible={new Set(["2", "3", "2_r1"])}
      onToggle={() => {}}
      slug="Baseball"
      syncMode="manual"
      mainDroneId="2"
      offsets={{ "2": 0, "3": 1.5 }}
      onSyncModeChange={() => {}}
      onMainDroneChange={onMainDroneChange}
      onOffsetChange={onOffsetChange}
    />,
  );
  expect(screen.getByLabelText("Main drone")).toHaveValue("2");
  expect(screen.queryByLabelText("D2 offset s")).not.toBeInTheDocument();
  const offset = screen.getByLabelText("D3 offset s");
  expect(offset).toHaveValue(1.5);
  expect(screen.queryByLabelText("D2_r1 offset s")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Main drone"), "3");
  expect(onMainDroneChange).toHaveBeenCalledWith("3");
  await user.clear(offset);
  await user.type(offset, "2");
  expect(onOffsetChange).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web/frontend && npx vitest run src/syncMode.test.ts src/components/DroneList.test.tsx`

Expected: FAIL — module missing; no ARM/Manual buttons.

- [ ] **Step 3: Minimal implementation**

`syncMode.ts` as specified.

`DroneList` analysis header:

```tsx
<div className="flex items-center justify-between gap-2">
  <span className="text-zinc-400">Drones</span>
  {variant === "analysis" && onSyncModeChange ? (
    <div className="flex items-center gap-1" role="group" aria-label="Sync mode">
      <button type="button" ... onClick={() => onSyncModeChange("arm")}>ARM</button>
      <button type="button" ... onClick={() => onSyncModeChange("manual")}>Manual</button>
    </div>
  ) : null}
</div>
```

Selected mode uses the same selected styling as the 3D engine toggle in `App.tsx` (`bg-zinc-700 text-zinc-100` vs `text-zinc-400`).

When `variant === "analysis" && syncMode === "manual"`, below the drone `<ul>` (still inside the list card):

- `<select aria-label="Main drone">` of `physicalSyncIds(displayIds)`
- For each other physical id: `<input type="number" step="any" aria-label={`D${id} offset s`}>` showing `offsets[id] ?? 0`. `onBlur` / change commit via `onOffsetChange(id, value)`.

`App.tsx`:

- State: `syncMode`, `mainDroneId`, `syncOffsets` hydrated from `detail.manifest.sync` on open (same place as other manifest fields). Default main = first physical id if missing.
- On mode/main/offset change: update state, `patchManifest(slug, { sync: { mode, main_drone_id: Number or string matching manifest drone ids, manual_offsets_s } })`, `setRefreshToken(n => n+1)`. Main change uses `rebaseOffsets`.
- `unsyncedBanner` empty when `syncMode === "manual"`.
- Pass new props only on Analysis `DroneList`.

README Time sync: document the toggle and that Manual uses first-sample + offsets. UI bullet: toggle to the right of Drones. UPDATES `## 0.81.0 - 2D markers and manual sync` on top (markers + toggle + offsets).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web/frontend && npx vitest run src/syncMode.test.ts src/components/DroneList.test.tsx src/App.test.tsx`

Expected: PASS. Then full frontend + backend pytest once before commit.

- [ ] **Step 5: Commit**

```bash
git add web/frontend/src/syncMode.ts web/frontend/src/syncMode.test.ts web/frontend/src/components/DroneList.tsx web/frontend/src/components/DroneList.test.tsx web/frontend/src/App.tsx web/frontend/src/App.test.tsx README.md UPDATES.md
git commit -m "$(cat <<'EOF'
feat: Analysis ARM/Manual sync toggle and relative offsets

Operators without ARM pick a main drone and shift others in seconds.
EOF
)"
```
