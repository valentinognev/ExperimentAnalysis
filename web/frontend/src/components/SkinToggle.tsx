import { useSkin } from "../SkinContext";

function skinButtonClass(active: boolean): string {
  return `rounded px-2 py-0.5 text-xs ${
    active ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900"
  }`;
}

export default function SkinToggle() {
  const { skin, setSkin } = useSkin();

  return (
    <div role="group" aria-label="Skin" className="flex items-center gap-2">
      <span className="text-xs text-zinc-400">Skin</span>
      <button
        type="button"
        className={skinButtonClass(skin === "night")}
        aria-pressed={skin === "night"}
        onClick={() => setSkin("night")}
      >
        Night
      </button>
      <button
        type="button"
        className={skinButtonClass(skin === "day")}
        aria-pressed={skin === "day"}
        onClick={() => setSkin("day")}
      >
        Day
      </button>
    </div>
  );
}
