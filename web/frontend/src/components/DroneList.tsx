type Props = {
  droneIds: string[];
  visible: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
};

export default function DroneList({ droneIds, visible, onToggle }: Props) {
  if (droneIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
      <span className="text-zinc-400">Drones</span>
      {droneIds.map((id) => (
        <label key={id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={visible.has(id)}
            onChange={(e) => onToggle(id, e.target.checked)}
          />
          <span>D{id}</span>
        </label>
      ))}
    </div>
  );
}
