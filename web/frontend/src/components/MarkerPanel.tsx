import { useMemo, useState } from "react";
import { distanceM, type Marker } from "../markers";

type MarkerPanelProps = {
  markers: Marker[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onLabelChange: (id: string, label: string) => void;
  onRemove: (id: string) => void;
};

export default function MarkerPanel({
  markers,
  selectedIds,
  onSelect,
  onLabelChange,
  onRemove,
}: MarkerPanelProps) {
  const [shiftHeld, setShiftHeld] = useState(false);

  const distances = useMemo(() => {
    if (selectedIds.length !== 2) return null;
    const a = markers.find((m) => m.id === selectedIds[0]);
    const b = markers.find((m) => m.id === selectedIds[1]);
    if (!a || !b) return null;
    return distanceM(a, b);
  }, [markers, selectedIds]);

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter((x) => x !== id));
      return;
    }
    if (selectedIds.length >= 2) {
      onSelect(shiftHeld ? [...selectedIds.slice(1), id] : [id]);
      return;
    }
    onSelect([...selectedIds, id]);
  };

  return (
    <div
      className="rounded border border-zinc-800 p-3 text-sm"
      onKeyDown={(e) => setShiftHeld(e.shiftKey)}
      onKeyUp={(e) => setShiftHeld(e.shiftKey)}
    >
      <h2 className="mb-2 font-medium">Markers</h2>
      <p className="mb-2 text-xs text-zinc-400">
        Click the 3D ground to add. Select two to measure.
      </p>
      {markers.length === 0 ? (
        <p className="text-zinc-500">No markers yet.</p>
      ) : (
        <ul className="space-y-1">
          {markers.map((m) => {
            const selected = selectedIds.includes(m.id);
            return (
              <li
                key={m.id}
                className={`flex items-center gap-2 rounded px-1 py-0.5 ${
                  selected ? "bg-zinc-800" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(m.id)}
                  aria-label={`Select ${m.label}`}
                />
                <input
                  className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5"
                  value={m.label}
                  onChange={(e) => onLabelChange(m.id, e.target.value)}
                />
                <button
                  type="button"
                  className="text-zinc-500 hover:text-red-400"
                  onClick={() => onRemove(m.id)}
                  aria-label={`Remove ${m.label}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {distances && (
        <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
          <dt className="text-zinc-400">Horizontal</dt>
          <dd>{distances.horizontal_m.toFixed(2)} m</dd>
          <dt className="text-zinc-400">3D ENU</dt>
          <dd>{distances.enu_3d_m.toFixed(2)} m</dd>
        </dl>
      )}
    </div>
  );
}
