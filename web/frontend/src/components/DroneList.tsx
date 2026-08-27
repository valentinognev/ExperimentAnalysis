import { pullDrone } from "../api";

type Props = {
  droneIds: string[];
  visible: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  slug: string | null;
  onPulled?: () => void;
};

export default function DroneList({
  droneIds,
  visible,
  onToggle,
  slug,
  onPulled,
}: Props) {
  if (droneIds.length === 0) return null;

  async function handlePull(droneId: string, adapter: "ssh" | "mavlink") {
    if (!slug) return;
    await pullDrone(slug, Number(droneId), [adapter]);
    onPulled?.();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
      <span className="text-zinc-400">Drones</span>
      {droneIds.map((id) => (
        <div key={id} className="flex items-center gap-1.5">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={visible.has(id)}
              onChange={(e) => onToggle(id, e.target.checked)}
            />
            <span>D{id}</span>
          </label>
          <button
            type="button"
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-800 disabled:opacity-50"
            disabled={!slug}
            onClick={() => handlePull(id, "ssh")}
          >
            SSH
          </button>
          <button
            type="button"
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-800 disabled:opacity-50"
            disabled={!slug}
            onClick={() => handlePull(id, "mavlink")}
          >
            MAVLink
          </button>
        </div>
      ))}
    </div>
  );
}
