import { useState } from "react";
import {
  type ChannelNode,
  filterChannelTree,
  leafSelectionState,
  selectionAfterToggle,
} from "../plotBoard";

type Props = {
  nodes: ChannelNode[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onApply: () => void;
  onCancel: () => void;
};

export default function ChannelPicker({
  nodes,
  selected,
  onSelectedChange,
  onApply,
  onCancel,
}: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const visible = filterChannelTree(nodes, query);
  const searching = query.trim() !== "";

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 p-2">
      <input
        type="search"
        aria-label="Search channels"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
      />
      <div className="max-h-80 overflow-y-auto">
        <NodeList
          nodes={visible}
          selected={selected}
          searching={searching}
          expanded={expanded}
          indent={false}
          onToggleExpand={toggleExpand}
          onSelectedChange={onSelectedChange}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="rounded bg-orange-600 px-3 py-1 text-sm hover:bg-orange-500 disabled:opacity-50"
          disabled={selected.size === 0}
          onClick={onApply}
        >
          Apply
        </button>
        <button
          type="button"
          className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function NodeList({
  nodes,
  selected,
  searching,
  expanded,
  indent,
  onToggleExpand,
  onSelectedChange,
}: {
  nodes: ChannelNode[];
  selected: Set<string>;
  searching: boolean;
  expanded: Set<string>;
  indent: boolean;
  onToggleExpand: (id: string) => void;
  onSelectedChange: (next: Set<string>) => void;
}) {
  return (
    <ul className={indent ? "space-y-1 pl-3 text-sm" : "space-y-1 text-sm"}>
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          selected={selected}
          searching={searching}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onSelectedChange={onSelectedChange}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  selected,
  searching,
  expanded,
  onToggleExpand,
  onSelectedChange,
}: {
  node: ChannelNode;
  selected: Set<string>;
  searching: boolean;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectedChange: (next: Set<string>) => void;
}) {
  const isFolder = Boolean(node.children?.length);
  const isExpanded = searching || expanded.has(node.id);
  const state = leafSelectionState(selected, node);

  return (
    <li>
      <div className="flex items-center gap-2">
        {isFolder && (
          <button
            type="button"
            aria-label={node.id}
            aria-expanded={isExpanded}
            className="font-mono text-xs text-zinc-200"
            onClick={() => onToggleExpand(node.id)}
          >
            {node.label}
          </button>
        )}
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            aria-label={node.id}
            checked={state === "all"}
            ref={(el) => {
              if (el) el.indeterminate = state === "some";
            }}
            onChange={() => onSelectedChange(selectionAfterToggle(selected, node))}
          />
          {!isFolder && (
            <span className="font-mono text-xs text-zinc-200">{node.label}</span>
          )}
        </label>
      </div>
      {isFolder && isExpanded && node.children && (
        <NodeList
          nodes={node.children}
          selected={selected}
          searching={searching}
          expanded={expanded}
          indent
          onToggleExpand={onToggleExpand}
          onSelectedChange={onSelectedChange}
        />
      )}
    </li>
  );
}
