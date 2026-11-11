/** Sidebar workspace tabs. Stats & Streaks sits under Manuscript until the reader moves it. */

export const WORKSPACE_TABS = ['manuscript', 'streaks', 'export', 'history'] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

const TAB_SET = new Set<string>(WORKSPACE_TABS);

export function isWorkspaceTab(value: string): value is WorkspaceTab {
  return TAB_SET.has(value);
}

/** Keep a saved order, drop unknown ids, and append any tab the save does not mention. */
export function workspaceTabOrderFromStored(value: unknown): WorkspaceTab[] {
  const seen = new Set<WorkspaceTab>();
  const order: WorkspaceTab[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string' || !isWorkspaceTab(item) || seen.has(item)) continue;
      seen.add(item);
      order.push(item);
    }
  }
  for (const tab of WORKSPACE_TABS) {
    if (!seen.has(tab)) order.push(tab);
  }
  return order;
}

/** Move `from` into the slot `to` currently occupies. */
export function reorderWorkspaceTabs(
  order: readonly WorkspaceTab[],
  from: WorkspaceTab,
  to: WorkspaceTab,
): WorkspaceTab[] {
  const current = workspaceTabOrderFromStored(order);
  if (from === to) return current;
  const fromIndex = current.indexOf(from);
  const toIndex = current.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return current;
  const next = [...current];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}
