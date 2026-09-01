import { tabLabel, type WorkspaceTab } from "../workspaceTab";

const TABS: WorkspaceTab[] = ["sources", "analysis", "replay"];

type Props = {
  tab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
};

export default function WorkspaceTabs({ tab, onTabChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="flex items-center gap-1 border-b border-zinc-800 px-4"
    >
      {TABS.map((id) => {
        const selected = tab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`workspace-tab-${id}`}
            aria-selected={selected}
            aria-controls={`workspace-panel-${id}`}
            className={`border-b-2 px-3 py-2 text-sm ${
              selected
                ? "border-zinc-100 font-medium text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => onTabChange(id)}
          >
            {tabLabel(id)}
          </button>
        );
      })}
    </div>
  );
}
