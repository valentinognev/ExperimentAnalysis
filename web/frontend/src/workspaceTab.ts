export type WorkspaceTab = "sources" | "analysis";
export type WorkspaceAction = "import" | "pull" | "rebuild";

export const DEFAULT_TAB: WorkspaceTab = "sources";

export function tabLabel(tab: WorkspaceTab): string {
  return tab === "sources" ? "Sources" : "Analysis";
}

/** Tabs change only when the operator clicks them. */
export function tabAfterAction(
  _action: WorkspaceAction,
  current: WorkspaceTab,
): WorkspaceTab {
  return current;
}
