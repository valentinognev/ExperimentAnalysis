# Replay Param Enum/Bitmask Editors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Replay param table, keep the numeric field and add QGroundControl-backed enum dropdowns, bitmask checkboxes, and boolean On/Off selects.

**Architecture:** Parse QGC `ParameterFactMetaData` XML into a compact lookup (name → enum options | bits | boolean). Frontend `paramMeta(name)` overlays that onto the existing `{name, value}` inspect list. Overrides stay numbers. No inspect/start API change.

**Tech Stack:** Python 3.11+ stdlib XML; React 19, TypeScript, Vitest, Testing Library, Tailwind.

**Spec:** In-chat design 2026-09-01 (bounded; no separate spec file). QGC source of labels: `/home/valentin/.config/QGroundControl/ParameterFactMetaData.json` (XML despite `.json`).

## Global Constraints

- Keep the numeric `<input>` on every param row. Enum/bitmask/boolean editors are additional, never a replacement.
- Overrides posted to replay remain `Record<string, number | string>` of numeric values (same as today). Do not send labels.
- No inspect/start API change. Do not add metadata fields to `inspect_ulog` / `POST .../replay/inspect`.
- Metadata lives in this repo as compact JSON generated from QGC XML. Do not copy the full 16k-line XML. Do not read `~/.config/QGroundControl` at runtime in the UI.
- Kind priority when parsing one parameter: `<bitmask>` with at least one `<bit>` → `bitmask`; else `<values>` with at least one `<value>` → `enum`; else `boolean="true"` → `boolean`; else omit.
- Enum option display: `{code} — {label}` (em dash, spaces). Bit checkbox visible text is the QGC bit label. Boolean options: `Off` = 0, `On` = 1.
- Unmatched numeric values stay legal: enum/boolean select gains a `custom ({n})` option; bitmask checkboxes reflect only defined bits.
- TDD: failing test first, watch it fail, then minimal code. Record RED/GREEN in the implementer report.
- Work only in this worktree/branch (`feat/replay-param-editors`). Do not touch the user's `main` checkout.
- Backend tests: `cd web/backend && .venv/bin/python -m pytest` (focused file while iterating; full `not e2e` suite once before commit). Frontend: `cd web/frontend && npx vitest run` similarly.
- Version: `UPDATES.md` HEAD is `0.78.0`; this feature is `0.79.0`. Fold README/UPDATES into Task 3.
- Do not create markdown other than README.md / UPDATES.md edits required by Task 3 (this plan already exists).
- Implementers never dispatch subagents or reviewers.
- Do not bind ports 6500 or 6573. Do not import PX4Replay.
- Night/Day: reuse `INPUT` / `LABEL` from `web/frontend/src/replay/ui.ts` for selects; no new skin.

## File map

- Create: `web/backend/ea/replay/param_meta.py`
- Create: `web/backend/tests/test_param_meta.py`
- Create: `web/backend/tests/fixtures/param_meta_sample.xml`
- Create: `web/frontend/src/replay/paramMeta.json` (generated, committed)
- Create: `web/frontend/src/replay/paramMeta.ts`
- Create: `web/frontend/src/replay/paramMeta.test.ts`
- Modify: `web/frontend/src/replay/ParamTable.tsx`
- Modify: `web/frontend/src/replay/ParamTable.test.tsx`
- Modify: `README.md`, `UPDATES.md` (Task 3)

---

### Task 1: Parse QGC parameter metadata into compact JSON

**Files:**
- Create: `web/backend/ea/replay/param_meta.py`
- Create: `web/backend/tests/test_param_meta.py`
- Create: `web/backend/tests/fixtures/param_meta_sample.xml`
- Create: `web/frontend/src/replay/paramMeta.json`

**Interfaces:**
- Consumes: QGC ParameterFactMetaData XML (fixture in tests; real QGC file when generating)
- Produces (`ea.replay.param_meta`):
  - `parse_param_meta(xml: str | Path) -> dict[str, dict]`
    - enum: `{"kind": "enum", "options": [{"value": int, "label": str}, ...]}`
    - bitmask: `{"kind": "bitmask", "bits": [{"index": int, "label": str}, ...]}`
    - boolean: `{"kind": "boolean"}`
  - `write_param_meta_json(src: Path, dest: Path) -> dict` — parse `src`, write compact JSON (keys sorted) to `dest`, return the dict
- Default QGC path for generation only (not imported by FastAPI at request time): `/home/valentin/.config/QGroundControl/ParameterFactMetaData.json`

- [ ] **Step 1: Write fixture** `web/backend/tests/fixtures/param_meta_sample.xml`:

```xml
<parameters>
  <parameter name="EKF2_HGT_REF" type="INT32">
    <values>
      <value code="0">Barometric pressure</value>
      <value code="1">GPS</value>
    </values>
  </parameter>
  <parameter name="EKF2_GPS_CTRL" type="INT32">
    <bitmask>
      <bit index="0">Lon/lat</bit>
      <bit index="1">Altitude</bit>
    </bitmask>
  </parameter>
  <parameter name="EKF2_BARO_CTRL" type="INT32" boolean="true">
  </parameter>
  <parameter name="EKF2_RNG_NOISE" type="FLOAT">
    <short_desc>Range finder noise</short_desc>
  </parameter>
  <parameter name="BOTH_MASK" type="INT32" boolean="true">
    <values>
      <value code="0">Ignore me</value>
    </values>
    <bitmask>
      <bit index="2">Win</bit>
    </bitmask>
  </parameter>
</parameters>
```

- [ ] **Step 2: Write the failing tests** `web/backend/tests/test_param_meta.py`:

```python
from pathlib import Path
from ea.replay.param_meta import parse_param_meta, write_param_meta_json

FIXTURE = Path(__file__).parent / "fixtures" / "param_meta_sample.xml"


def test_parse_enum_bitmask_boolean_and_omit_plain():
    meta = parse_param_meta(FIXTURE)
    assert meta["EKF2_HGT_REF"] == {
        "kind": "enum",
        "options": [
            {"value": 0, "label": "Barometric pressure"},
            {"value": 1, "label": "GPS"},
        ],
    }
    assert meta["EKF2_GPS_CTRL"] == {
        "kind": "bitmask",
        "bits": [
            {"index": 0, "label": "Lon/lat"},
            {"index": 1, "label": "Altitude"},
        ],
    }
    assert meta["EKF2_BARO_CTRL"] == {"kind": "boolean"}
    assert "EKF2_RNG_NOISE" not in meta


def test_bitmask_wins_over_values_and_boolean():
    meta = parse_param_meta(FIXTURE)
    assert meta["BOTH_MASK"] == {
        "kind": "bitmask",
        "bits": [{"index": 2, "label": "Win"}],
    }


def test_write_json_roundtrip(tmp_path):
    dest = tmp_path / "paramMeta.json"
    data = write_param_meta_json(FIXTURE, dest)
    assert dest.is_file()
    assert data == parse_param_meta(FIXTURE)
```

- [ ] **Step 3: Run tests — expect FAIL** (import error / not defined)

Run: `cd web/backend && .venv/bin/python -m pytest tests/test_param_meta.py -v`

- [ ] **Step 4: Implement** `parse_param_meta` / `write_param_meta_json` with `xml.etree.ElementTree`. Accept `str` XML or a `Path`. Strip bit/value text. Parse `code` / `index` as `int`.

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Generate committed JSON** from the real QGC file:

```python
from pathlib import Path
from ea.replay.param_meta import write_param_meta_json
src = Path("/home/valentin/.config/QGroundControl/ParameterFactMetaData.json")
dest = Path("web/frontend/src/replay/paramMeta.json")  # relative to repo root
write_param_meta_json(src, dest)
```

Assert generated JSON contains `EKF2_HGT_REF` kind enum, `EKF2_GPS_CTRL` kind bitmask, `EKF2_BARO_CTRL` kind boolean. Pretty-print JSON with sorted keys, 2-space indent, trailing newline.

- [ ] **Step 7: Commit** `feat: parse QGC param enum and bitmask metadata`

---

### Task 2: TypeScript paramMeta lookup and bit helpers

**Files:**
- Create: `web/frontend/src/replay/paramMeta.ts`
- Create: `web/frontend/src/replay/paramMeta.test.ts`
- Modify if needed: `web/frontend/tsconfig.app.json` (`resolveJsonModule`: true) so `paramMeta.json` imports typecheck

**Interfaces:**
- Consumes: `web/frontend/src/replay/paramMeta.json` from Task 1
- Produces (`web/frontend/src/replay/paramMeta.ts`):

```ts
export type EnumOption = { value: number; label: string };
export type Bit = { index: number; label: string };
export type EnumMeta = { kind: "enum"; options: EnumOption[] };
export type BitmaskMeta = { kind: "bitmask"; bits: Bit[] };
export type BooleanMeta = { kind: "boolean" };
export type ParamMeta = EnumMeta | BitmaskMeta | BooleanMeta;

export function paramMeta(name: string): ParamMeta | undefined;
export function bitOn(value: number, index: number): boolean;
export function setBit(value: number, index: number, on: boolean): number;
export function enumOptionValues(meta: EnumMeta): number[];
export function asNumber(value: number | string): number;
```

- `paramMeta` looks up the generated JSON by exact name; missing → `undefined`
- `bitOn`: `(value & (1 << index)) !== 0`
- `setBit`: `on` → `value | (1 << index)`; off → `value & ~(1 << index)` (32-bit unsigned via `>>> 0` so clearing bit 31 stays non-negative)
- `asNumber`: `Number(value)`; if `NaN`, treat as `0`
- `enumOptionValues`: the `options[].value` list in order

- [ ] **Step 1: Write the failing tests** `web/frontend/src/replay/paramMeta.test.ts`:

```ts
import { expect, it } from "vitest";
import {
  asNumber,
  bitOn,
  enumOptionValues,
  paramMeta,
  setBit,
} from "./paramMeta";

it("looks up QGC enum bitmask and boolean", () => {
  const hgt = paramMeta("EKF2_HGT_REF");
  expect(hgt?.kind).toBe("enum");
  if (hgt?.kind === "enum") {
    expect(hgt.options).toContainEqual({ value: 1, label: "GPS" });
  }
  const gps = paramMeta("EKF2_GPS_CTRL");
  expect(gps?.kind).toBe("bitmask");
  if (gps?.kind === "bitmask") {
    expect(gps.bits).toContainEqual({ index: 0, label: "Lon/lat" });
  }
  expect(paramMeta("EKF2_BARO_CTRL")).toEqual({ kind: "boolean" });
  expect(paramMeta("EKF2_RNG_NOISE")).toBeUndefined();
});

it("toggles bitmask bits", () => {
  expect(bitOn(7, 0)).toBe(true);
  expect(bitOn(7, 3)).toBe(false);
  expect(setBit(7, 0, false)).toBe(6);
  expect(setBit(6, 3, true)).toBe(14);
});

it("asNumber coerces strings", () => {
  expect(asNumber("3")).toBe(3);
  expect(asNumber("x")).toBe(0);
});

it("enumOptionValues lists codes", () => {
  const hgt = paramMeta("EKF2_HGT_REF");
  if (hgt?.kind !== "enum") throw new Error("expected enum");
  expect(enumOptionValues(hgt)).toContain(0);
  expect(enumOptionValues(hgt)).toContain(1);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd web/frontend && npx vitest run src/replay/paramMeta.test.ts`

- [ ] **Step 3: Implement** `paramMeta.ts`. Import JSON (add `resolveJsonModule` if tsc requires it). Do not duplicate labels in this file.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat: add replay paramMeta lookup and bit helpers`

---

### Task 3: ParamTable enum, bitmask, and boolean editors

**Files:**
- Modify: `web/frontend/src/replay/ParamTable.tsx`
- Modify: `web/frontend/src/replay/ParamTable.test.tsx`
- Modify: `README.md` (Replay param-table bullet: number plus enum select / bitmask checkboxes / boolean On/Off from QGC metadata)
- Modify: `UPDATES.md` (new top `0.79.0`)

**Interfaces:**
- Consumes: `paramMeta`, `bitOn`, `setBit`, `asNumber`, `enumOptionValues` from Task 2; existing `onCellChange` / `apply` path
- Produces: same `onOverrides` diffs of numbers; no new props required on `ParamTable`

UI per visible param row (name cell unchanged):

1. Numeric input stays (`name={p.name}`, `type=number` when original is a number).
2. If `paramMeta(p.name)?.kind === "enum"`: `<select aria-label="{name} enum">` with one `<option value={code}>` per option, label `{code} — {label}`. If current number is not in `enumOptionValues`, also render `<option value={n}>custom ({n})</option>` and select it.
3. If kind `boolean`: `<select aria-label="{name} boolean">` options `Off` (0), `On` (1), plus `custom ({n})` when n is not 0 or 1.
4. If kind `bitmask`: for each bit, `<label>` with `<input type="checkbox" aria-label="{name} bit {index}: {label}">` checked iff `bitOn(asNumber(p.value), index)`.
5. Changing select or checkbox calls the same apply path as typing the number (number type when original is a number).
6. Params with `undefined` meta stay number-only.

Layout: number input full width; select/checkboxes in the same value `<td>` under the input (`flex flex-col gap-1`). Bit checkboxes wrap (`flex flex-wrap gap-2`).

Existing tests must still pass (filter, Reset, session restore, nested groups). `paramInput` helper stays `input[name=...]` for the number field.

- [ ] **Step 1: Write the failing tests** append to `ParamTable.test.tsx` (reuse `userEvent`, jsdom). Use only these params so EKF2 group has leaf rows (no nested collapse):

```ts
const editorParams = [
  { name: "EKF2_HGT_REF", value: 1 },
  { name: "EKF2_GPS_CTRL", value: 7 },
  { name: "EKF2_BARO_CTRL", value: 1 },
  { name: "MC_ROLL_P", value: 6 },
];
```

Tests:

```ts
it("enum select shows QGC labels and writing a number updates the select", async () => {
  render(<ParamTable params={editorParams} onOverrides={() => {}} />);
  const sel = screen.getByRole("combobox", { name: "EKF2_HGT_REF enum" });
  expect(sel).toHaveValue("1");
  expect(screen.getByRole("option", { name: "1 — GPS" })).toBeInTheDocument();
  await userEvent.clear(paramInput("EKF2_HGT_REF")!);
  await userEvent.type(paramInput("EKF2_HGT_REF")!, "0");
  expect(sel).toHaveValue("0");
});

it("choosing an enum option writes the number override", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={editorParams} onOverrides={onOverrides} />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "EKF2_HGT_REF enum" }),
    "0",
  );
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_HGT_REF: 0 });
  expect(paramInput("EKF2_HGT_REF")).toHaveValue(0);
});

it("unmatched enum value shows custom option", () => {
  render(
    <ParamTable
      params={[{ name: "EKF2_HGT_REF", value: 99 }]}
      onOverrides={() => {}}
    />,
  );
  expect(
    screen.getByRole("combobox", { name: "EKF2_HGT_REF enum" }),
  ).toHaveValue("99");
  expect(screen.getByRole("option", { name: "custom (99)" })).toBeInTheDocument();
});

it("bitmask checkboxes follow the number and toggling writes OR", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={editorParams} onOverrides={onOverrides} />);
  const lon = screen.getByRole("checkbox", {
    name: "EKF2_GPS_CTRL bit 0: Lon/lat",
  });
  const dual = screen.getByRole("checkbox", {
    name: "EKF2_GPS_CTRL bit 3: Dual antenna heading",
  });
  expect(lon).toBeChecked();
  expect(dual).not.toBeChecked();
  await userEvent.click(lon);
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_GPS_CTRL: 6 });
});

it("boolean select Off/On writes 0/1", async () => {
  const onOverrides = vi.fn();
  render(<ParamTable params={editorParams} onOverrides={onOverrides} />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "EKF2_BARO_CTRL boolean" }),
    "0",
  );
  expect(onOverrides).toHaveBeenCalledWith({ EKF2_BARO_CTRL: 0 });
});

it("params without metadata have no extra combobox", () => {
  render(
    <ParamTable
      params={[{ name: "EKF2_RNG_NOISE", value: 0.1 }]}
      onOverrides={() => {}}
    />,
  );
  expect(paramInput("EKF2_RNG_NOISE")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — expect FAIL** (no combobox / checkbox)

Run: `cd web/frontend && npx vitest run src/replay/ParamTable.test.tsx`

- [ ] **Step 3: Implement** editors in `ParamTable.tsx` (extract a small `ParamValueEditor` in the same file if the row render grows). Do not change grouping/filter/session behavior.

- [ ] **Step 4: Run ParamTable tests — expect PASS**, then full `npx vitest run`.

- [ ] **Step 5: UPDATES.md** new top:

```markdown
## 0.79.0 - Replay param enum and bitmask editors
- Replay param table keeps the number field and adds QGC-backed enum dropdowns, bitmask checkboxes, and boolean On/Off
- Compact `paramMeta.json` generated from QGroundControl ParameterFactMetaData; unmatched numbers stay legal (`custom (n)`)
```

README Replay tab bullet: mention number plus enum/bitmask/boolean editors from QGC metadata.

- [ ] **Step 6: Commit** `feat: replay param enum bitmask and boolean editors`
