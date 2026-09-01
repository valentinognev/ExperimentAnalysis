export type WorkspaceTab = "sources" | "analysis" | "replay";
export type WorkspaceAction = "import" | "pull" | "rebuild";

export const DEFAULT_TAB: WorkspaceTab = "sources";

export function tabLabel(tab: WorkspaceTab): string {
  if (tab === "sources") return "Sources";
  if (tab === "analysis") return "Analysis";
  return "Replay";
}

/** Tabs change only when the operator clicks them. */
export function tabAfterAction(
  _action: WorkspaceAction,
  current: WorkspaceTab,
): WorkspaceTab {
  return current;
}
