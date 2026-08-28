# Channel Picker Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Analysis tab's flat channel checklist with a searchable drone/source/topic/field tree, commit the plot only on Apply, and let an existing plot's channels be changed via Edit.

**Architecture:** Keep channel ids `{drone}.{source}.{topic}.{field}`. Pure helpers in `plotBoard.ts` build and filter a `ChannelNode` tree from the existing `TopicsTree`. A `ChannelPicker` component renders expand/collapse, folder+leaf checkboxes, search, Apply, and Cancel. `PlotBoard` opens that picker for Add plot (empty selection) and Edit (pre-checked channels), and only then calls `addPlot` / `setPlotChannels`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind. No new dependencies. No API change.

**Spec:** Approved in-chat design (2026-08-28): tree from channel-id segments; case-insensitive substring search on full channel id; folder checkbox selects/deselects descendant leaves; Apply presents the plot; Edit reopens the picker for that plot.

## Global Constraints

- Channel ids stay `{drone}.{source}.{topic}.{field}` with source `ulog` | `sm` | `ha`. Do not invent a new id format.
- No backend / API change. Topics still come from `GET /api/experiments/{slug}/topics`.
- TDD: write the failing test first, watch it fail, then implement. Record RED/GREEN evidence in the implementer report.
- Checking boxes must not create a plot or fetch series. Only **Apply** commits the selection.
- **Add plot** remains the opener. The commit button label is **Apply**, not `Add (N)`.
- **Edit** sits next to **Remove** on each plot pane and updates that plot in place via existing `setPlotChannels` (same `id`).
- Search is a case-insensitive substring of the full channel id (e.g. `local_pos`, `2.ulog`, `.x`). Empty query shows the full tree.
- Non-matching branches are omitted while searching; visible matching folders render expanded.
- Folder checkbox: all descendant leaves selected → checked; some → indeterminate; none → unchecked. Click: if all selected, deselect all those leaves; else select all.
- Follow existing Analysis styling: `zinc` dark cards, `text-sm` / `text-xs`, `font-mono` on channel labels.
- Do not add markdown files other than the required `README.md` / `UPDATES.md` edits in Task 3.
- Work and commit only on the feature branch in the isolated worktree. Do not touch the user's dirty files on `main`.
- Frontend tests: `cd web/frontend && npx vitest run` (focused file while iterating; full frontend suite once before commit).
- Version on this branch: `UPDATES.md` HEAD is `0.55.0`; this feature is `0.56.0`.

---

### Task 1: Channel tree and search helpers

**Files:**
- Modify: `web/frontend/src/plotBoard.ts`
- Test: `web/frontend/src/plotBoard.test.ts`

**Interfaces:**
- Consumes: existing `TopicsTree` (`Record<string, Record<string, Record<string, string[]>>>`)
- Produces:
  - `export type ChannelNode = { id: string; label: string; children?: ChannelNode[] }`
  - `export function topicsToChannelTree(tree: TopicsTree): ChannelNode[]`
  - `export function filterChannelTree(nodes: ChannelNode[], query: string): ChannelNode[]`
  - `export function channelLeaves(node: ChannelNode): string[]`
  - `export function selectionAfterToggle(selected: ReadonlySet<string>, node: ChannelNode): Set<string>`
  - `export function leafSelectionState(selected: ReadonlySet<string>, node: ChannelNode): "none" | "some" | "all"`
- Leaves have no `children` (omit or empty). A leaf's `id` is the full channel id. A folder's `id` is the dotted prefix (`2`, `2.ulog`, `2.ulog.vehicle_local_position`).
- Keep existing `flattenTopics`, `addPlot`, `removePlot`, `setPlotChannels` unchanged.

- [ ] **Step 1: Write the failing tests** in `web/frontend/src/plotBoard.test.ts` (append; keep existing tests). Use this fixture and cases:

```ts
const topics = {
  "2": {
    ulog: { vehicle_local_position: ["x", "y"] },
    sm: { sm_system_manager: ["state"] },
  },
  "4": {
    ulog: { vehicle_attitude: ["q[0]"] },
  },
};

it("topicsToChannelTree groups drone → source → topic → field", () => {
  const tree = topicsToChannelTree(topics);
  expect(tree.map((n) => n.label)).toEqual(["2", "4"]);
  expect(tree[0].children!.map((n) => n.label)).toEqual(["sm", "ulog"]);
  const ulog = tree[0].children!.find((n) => n.label === "ulog")!;
  const topic = ulog.children!.find((n) => n.label === "vehicle_local_position")!;
  expect(topic.children!.map((n) => n.id)).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
  expect(topic.children![0].label).toBe("x");
  expect(topic.children![0].children).toBeFalsy();
});

it("filterChannelTree keeps only matching leaves and their ancestors", () => {
  const tree = topicsToChannelTree(topics);
  const filtered = filterChannelTree(tree, "local_pos");
  expect(filtered.map((n) => n.label)).toEqual(["2"]);
  const ids = filtered.flatMap((n) => n.children ?? []).flatMap(function leaves(n: ChannelNode): string[] {
    return n.children?.length ? n.children.flatMap(leaves) : [n.id];
  });
  expect(ids).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
});

it("filterChannelTree is case-insensitive and matches dotted prefixes", () => {
  const tree = topicsToChannelTree(topics);
  const filtered = filterChannelTree(tree, "2.ULOG");
  const ids = filtered.flatMap(function leaves(n: ChannelNode): string[] {
    return n.children?.length ? n.children.flatMap(leaves) : [n.id];
  });
  expect(ids.sort()).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
});

it("filterChannelTree empty query returns the original tree", () => {
  const tree = topicsToChannelTree(topics);
  expect(filterChannelTree(tree, "  ")).toBe(tree);
});

it("channelLeaves returns all descendant channel ids", () => {
  const tree = topicsToChannelTree(topics);
  expect(channelLeaves(tree[0]).sort()).toEqual([
    "2.sm.sm_system_manager.state",
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
});

it("selectionAfterToggle selects all leaves when any are off, else clears them", () => {
  const tree = topicsToChannelTree(topics);
  const topic = tree[0].children!.find((n) => n.label === "ulog")!.children![0];
  const one = selectionAfterToggle(new Set(), topic);
  expect([...one].sort()).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
  const none = selectionAfterToggle(one, topic);
  expect(none.size).toBe(0);
});

it("leafSelectionState reports none / some / all", () => {
  const tree = topicsToChannelTree(topics);
  const topic = tree[0].children!.find((n) => n.label === "ulog")!.children![0];
  expect(leafSelectionState(new Set(), topic)).toBe("none");
  expect(leafSelectionState(new Set(["2.ulog.vehicle_local_position.x"]), topic)).toBe("some");
  expect(
    leafSelectionState(
      new Set([
        "2.ulog.vehicle_local_position.x",
        "2.ulog.vehicle_local_position.y",
      ]),
      topic,
    ),
  ).toBe("all");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web/frontend && npx vitest run src/plotBoard.test.ts`

Expected: FAIL because `topicsToChannelTree` / `filterChannelTree` / `channelLeaves` / `selectionAfterToggle` / `leafSelectionState` are not exported.

- [ ] **Step 3: Write minimal implementation** in `web/frontend/src/plotBoard.ts`:

```ts
export type ChannelNode = {
  id: string;
  label: string;
  children?: ChannelNode[];
};

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });
}

export function topicsToChannelTree(tree: TopicsTree): ChannelNode[] {
  return sortKeys(Object.keys(tree)).map((drone) => ({
    id: drone,
    label: drone,
    children: sortKeys(Object.keys(tree[drone])).map((source) => ({
      id: `${drone}.${source}`,
      label: source,
      children: sortKeys(Object.keys(tree[drone][source])).map((topic) => ({
        id: `${drone}.${source}.${topic}`,
        label: topic,
        children: [...tree[drone][source][topic]].sort().map((field) => ({
          id: `${drone}.${source}.${topic}.${field}`,
          label: field,
        })),
      })),
    })),
  }));
}

export function filterChannelTree(nodes: ChannelNode[], query: string): ChannelNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: ChannelNode[] = [];
  for (const node of nodes) {
    if (node.children?.length) {
      const children = filterChannelTree(node.children, query);
      if (children.length) out.push({ ...node, children });
    } else if (node.id.toLowerCase().includes(q)) {
      out.push(node);
    }
  }
  return out;
}

export function channelLeaves(node: ChannelNode): string[] {
  if (!node.children?.length) return [node.id];
  return node.children.flatMap(channelLeaves);
}

export function selectionAfterToggle(
  selected: ReadonlySet<string>,
  node: ChannelNode,
): Set<string> {
  const leaves = channelLeaves(node);
  const allOn = leaves.every((id) => selected.has(id));
  const next = new Set(selected);
  if (allOn) for (const id of leaves) next.delete(id);
  else for (const id of leaves) next.add(id);
  return next;
}

export function leafSelectionState(
  selected: ReadonlySet<string>,
  node: ChannelNode,
): "none" | "some" | "all" {
  const leaves = channelLeaves(node);
  const n = leaves.filter((id) => selected.has(id)).length;
  if (n === 0) return "none";
  if (n === leaves.length) return "all";
  return "some";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web/frontend && npx vitest run src/plotBoard.test.ts`

Expected: PASS, including the pre-existing `addPlot` / `flattenTopics` cases.

- [ ] **Step 5: Commit**

```bash
git add web/frontend/src/plotBoard.ts web/frontend/src/plotBoard.test.ts
git commit -m "$(cat <<'EOF'
feat: group plot channels into a searchable topic tree

EOF
)"
```

---

### Task 2: ChannelPicker tree UI

**Files:**
- Create: `web/frontend/src/components/ChannelPicker.tsx`
- Test: `web/frontend/src/components/ChannelPicker.test.tsx`

**Interfaces:**
- Consumes: Task 1 helpers (`ChannelNode`, `filterChannelTree`, `selectionAfterToggle`, `leafSelectionState`)
- Produces: `export default function ChannelPicker(props: { nodes: ChannelNode[]; selected: Set<string>; onSelectedChange: (next: Set<string>) => void; onApply: () => void; onCancel: () => void; })`
- Search is internal state. Apply is disabled when `selected.size === 0`. Apply does not clear selection (parent closes the picker).
- Visible tree = `filterChannelTree(nodes, query)`. With a non-empty trimmed query, every visible folder is expanded. With an empty query, folders start collapsed; a disclosure button toggles `aria-expanded`.
- Leaves are always shown when their folder is expanded (or when search forces expand). Do not render a flat list of full channel ids as the primary view.
- Checkbox `aria-label` is the node's `id` (unique). Folder checkboxes use `indeterminate` when state is `"some"`.
- Search input `aria-label="Search channels"`. Buttons: `Apply`, `Cancel`.

- [ ] **Step 1: Write the failing tests** in `web/frontend/src/components/ChannelPicker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ChannelPicker from "./ChannelPicker";
import { topicsToChannelTree } from "../plotBoard";

const nodes = topicsToChannelTree({
  "2": {
    ulog: { vehicle_local_position: ["x", "y"] },
    sm: { sm_system_manager: ["state"] },
  },
  "4": { ulog: { vehicle_attitude: ["q[0]"] } },
});

afterEach(() => cleanup());

it("hides fields until their topic is expanded", async () => {
  const user = userEvent.setup();
  render(
    <ChannelPicker
      nodes={nodes}
      selected={new Set()}
      onSelectedChange={() => {}}
      onApply={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.queryByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "2.ulog" }));
  await user.click(screen.getByRole("button", { name: "2.ulog.vehicle_local_position" }));
  expect(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "4.ulog.vehicle_attitude.q[0]" })).not.toBeInTheDocument();
});

it("search filters to matching channel ids and expands matches", async () => {
  const user = userEvent.setup();
  render(
    <ChannelPicker
      nodes={nodes}
      selected={new Set()}
      onSelectedChange={() => {}}
      onApply={() => {}}
      onCancel={() => {}}
    />,
  );
  await user.type(screen.getByRole("searchbox", { name: "Search channels" }), "attitude");
  expect(screen.getByRole("checkbox", { name: "4.ulog.vehicle_attitude.q[0]" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).not.toBeInTheDocument();
});

it("folder checkbox selects all descendant leaves", async () => {
  const user = userEvent.setup();
  const onSelectedChange = vi.fn();
  render(
    <ChannelPicker
      nodes={nodes}
      selected={new Set()}
      onSelectedChange={onSelectedChange}
      onApply={() => {}}
      onCancel={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "2.ulog" }));
  await user.click(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position" }));
  const next: Set<string> = onSelectedChange.mock.calls[0][0];
  expect([...next].sort()).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
});

it("Apply stays disabled until a channel is selected, then calls onApply", async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  const { rerender } = render(
    <ChannelPicker
      nodes={nodes}
      selected={new Set()}
      onSelectedChange={() => {}}
      onApply={onApply}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  rerender(
    <ChannelPicker
      nodes={nodes}
      selected={new Set(["2.ulog.vehicle_local_position.x"])}
      onSelectedChange={() => {}}
      onApply={onApply}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(onApply).toHaveBeenCalledTimes(1);
});
```

Disclosure buttons use `aria-label={node.id}` (the dotted prefix). Search uses `role="searchbox"` (`<input type="search">`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web/frontend && npx vitest run src/components/ChannelPicker.test.tsx`

Expected: FAIL because `ChannelPicker` does not exist.

- [ ] **Step 3: Write minimal `ChannelPicker.tsx`**

Use a local `Set<string>` of expanded folder ids. When `query.trim()` is non-empty, treat every visible folder as expanded (`isExpanded = query.trim() !== "" || expanded.has(node.id)`). Toggle expand only via the disclosure `<button type="button" aria-label={node.id} aria-expanded={...}>` showing `node.label`. Checkbox is separate, `aria-label={node.id}`. For `"some"`, set `el.indeterminate = true` in a callback ref. Call `onSelectedChange(selectionAfterToggle(selected, node))` on checkbox change. Layout: search input, then `max-h-80 overflow-y-auto` nested `<ul>` with `pl-3` per level, then Apply (orange, like current Add) and Cancel.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web/frontend && npx vitest run src/components/ChannelPicker.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/frontend/src/components/ChannelPicker.tsx web/frontend/src/components/ChannelPicker.test.tsx
git commit -m "$(cat <<'EOF'
feat: add searchable channel tree picker

EOF
)"
```

---

### Task 3: PlotBoard Apply and Edit

**Files:**
- Modify: `web/frontend/src/components/PlotBoard.tsx`
- Test: `web/frontend/src/components/PlotBoard.test.tsx` (create)
- Modify: `README.md` (Analysis UI bullet only — extra Plotly panes now use a tree picker with search, Apply, and Edit)
- Modify: `UPDATES.md` (new top entry `0.56.0`)

**Interfaces:**
- Consumes: `ChannelPicker`; `topicsToChannelTree`; existing `addPlot` / `setPlotChannels` / `removePlot`
- Produces: PlotBoard behavior below. `flattenTopics` is no longer used by PlotBoard (keep the helper; other tests still cover it).
- Store `TopicsTree` from `getTopics` (not a flat `string[]`).
- **Add plot** toggles the picker. Opening for add: `editingId = null`, `selected = empty`.
- **Edit** on a pane: opens the same picker with `selected = plot.channels`, `editingId = plot.id`.
- **Apply**: if `editingId` set → `onPlotsChange(setPlotChannels(plots, editingId, sorted selected))`; else → `onPlotsChange(addPlot(plots, sorted selected))`. Then close picker, clear selected, clear `editingId`.
- **Cancel** / slug change: close picker, clear selected, clear `editingId`.
- Remove the old flat `<ul>` of channel ids and the `Add (N)` button.

- [ ] **Step 1: Write the failing tests** in `web/frontend/src/components/PlotBoard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

vi.mock("react-plotly.js", () => ({
  default: function MockPlot() {
    return <div data-testid="plotly" />;
  },
}));

vi.mock("../api", () => ({
  getTopics: vi.fn(),
  getSeries: vi.fn(),
}));

import { getTopics, getSeries } from "../api";
import PlotBoard from "./PlotBoard";

const topics = {
  "2": { ulog: { vehicle_local_position: ["x", "y"] } },
};

beforeEach(() => {
  vi.mocked(getTopics).mockResolvedValue(topics);
  vi.mocked(getSeries).mockResolvedValue({
    "2.ulog.vehicle_local_position.x": { t: [0], y: [1] },
    "2.ulog.vehicle_local_position.y": { t: [0], y: [2] },
  });
});

afterEach(() => cleanup());

async function expandToFields(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "2.ulog" }));
  await user.click(screen.getByRole("button", { name: "2.ulog.vehicle_local_position" }));
}

it("does not add a plot until Apply", async () => {
  const user = userEvent.setup();
  const onPlotsChange = vi.fn();
  render(
    <PlotBoard slug="exp" t={0} plots={[]} onPlotsChange={onPlotsChange} />,
  );
  await user.click(screen.getByRole("button", { name: "Add plot" }));
  await waitFor(() => {
    expect(screen.getByRole("searchbox", { name: "Search channels" })).toBeInTheDocument();
  });
  await expandToFields(user);
  await user.click(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" }));
  expect(onPlotsChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(onPlotsChange).toHaveBeenCalledTimes(1);
  const next = onPlotsChange.mock.calls[0][0];
  expect(next).toHaveLength(1);
  expect(next[0].channels).toEqual(["2.ulog.vehicle_local_position.x"]);
});

it("Edit updates the same plot channels", async () => {
  const user = userEvent.setup();
  const onPlotsChange = vi.fn();
  const plots = [{ id: "p1", channels: ["2.ulog.vehicle_local_position.x"] }];
  render(
    <PlotBoard slug="exp" t={0} plots={plots} onPlotsChange={onPlotsChange} />,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => {
    expect(screen.getByRole("searchbox", { name: "Search channels" })).toBeInTheDocument();
  });
  await expandToFields(user);
  expect(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.y" }));
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(onPlotsChange.mock.calls[0][0][0]).toEqual({
    id: "p1",
    channels: [
      "2.ulog.vehicle_local_position.x",
      "2.ulog.vehicle_local_position.y",
    ],
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web/frontend && npx vitest run src/components/PlotBoard.test.tsx`

Expected: FAIL (no tree picker / no Edit / Apply still named `Add (N)` or missing).

- [ ] **Step 3: Wire PlotBoard**

- Replace `channelIds: string[]` with `topics: TopicsTree`.
- Import `ChannelPicker`, `topicsToChannelTree`, `setPlotChannels`.
- Add `editingId: string | null`.
- `PlotPane`: add **Edit** button to the left of **Remove** that calls `onEdit(plot)`.
- When `pickerOpen`, render `<ChannelPicker nodes={topicsToChannelTree(topics)} selected={selected} onSelectedChange={setSelected} onApply={handleApply} onCancel={handleCancel} />` instead of the flat list.
- `handleApply` as specified in Interfaces.
- Keep topics error span next to Add plot.

- [ ] **Step 4: Update docs**

`UPDATES.md` — newest entry on top:

```markdown
## 0.56.0 - Channel picker is a searchable tree
- Analysis Add plot: channels grouped drone → source → topic → field; search filters by substring
- Apply commits the selection; Edit on a plot pane reopens the picker for that plot
```

`README.md` — in the Analysis UI bullet, replace the extra-plot clause so it states tree picker + search + Apply + Edit (do not rewrite unrelated UI text).

- [ ] **Step 5: Run frontend tests**

Run: `cd web/frontend && npx vitest run`

Expected: PASS, including `App.test.tsx` still finding the **Add plot** button.

- [ ] **Step 6: Commit**

```bash
git add web/frontend/src/components/PlotBoard.tsx web/frontend/src/components/PlotBoard.test.tsx README.md UPDATES.md
git commit -m "$(cat <<'EOF'
feat: apply and edit plot channels from the tree picker

EOF
)"
```
