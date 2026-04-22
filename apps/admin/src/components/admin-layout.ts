export const ADMIN_SIDEBAR_STORAGE_KEY = "newsportal-admin-sidebar";

export const ADMIN_SIDEBAR_MODES = ["expanded", "compact"] as const;
export type AdminSidebarMode = (typeof ADMIN_SIDEBAR_MODES)[number];

export const ADMIN_PANE_STATES = ["open", "collapsed"] as const;
export type AdminPaneState = (typeof ADMIN_PANE_STATES)[number];

export function isAdminSidebarMode(
  value: string | null | undefined
): value is AdminSidebarMode {
  return ADMIN_SIDEBAR_MODES.includes(String(value ?? "") as AdminSidebarMode);
}

export function readAdminSidebarMode(
  value: string | null | undefined
): AdminSidebarMode {
  return isAdminSidebarMode(value) ? value : "expanded";
}

export function applyAdminSidebarMode(
  root: HTMLElement,
  mode: AdminSidebarMode
): AdminSidebarMode {
  root.dataset.adminSidebar = mode;
  return mode;
}

export function isAdminPaneState(
  value: string | null | undefined
): value is AdminPaneState {
  return ADMIN_PANE_STATES.includes(String(value ?? "") as AdminPaneState);
}

export function readAdminPaneState(
  value: string | null | undefined
): AdminPaneState {
  return isAdminPaneState(value) ? value : "open";
}

export function clampAdminPaneWidth(
  value: number,
  minWidth: number,
  maxWidth: number,
  fallbackWidth: number
): number {
  if (!Number.isFinite(value)) {
    return fallbackWidth;
  }
  return Math.min(maxWidth, Math.max(minWidth, value));
}

export function buildAdminPaneStateStorageKey(paneId: string): string {
  return `newsportal-admin-pane:${paneId}:state`;
}

export function buildAdminPaneWidthStorageKey(paneId: string): string {
  return `newsportal-admin-pane:${paneId}:width`;
}
