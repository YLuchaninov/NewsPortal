export type LiveUpdateSurface =
  | "feed"
  | "interests"
  | "matches"
  | "notifications"
  | "settings";

export interface LiveMetricSnapshot {
  total: number;
  revision: string;
}

export interface LiveInterestsSnapshot extends LiveMetricSnapshot {
  queuedCount: number;
  failedCount: number;
}

export interface LiveSettingsSnapshot {
  channelCount: number;
  preferencesRevision: string;
  channelsRevision: string;
}

export interface LiveRepairJobSnapshot {
  reindexJobId: string;
  status: string;
  interestId: string | null;
  processedArticles: number | null;
  totalArticles: number | null;
  finishedAt: string | null;
  errorText: string | null;
}

export interface LiveUpdatesSnapshot {
  fetchedAt: string;
  feed: LiveMetricSnapshot;
  interests: LiveInterestsSnapshot;
  matches: LiveMetricSnapshot;
  notifications: LiveMetricSnapshot;
  settings: LiveSettingsSnapshot;
  repairJobs: LiveRepairJobSnapshot[];
}

export interface LiveUpdatesResponse {
  sessionActive: boolean;
  snapshot: LiveUpdatesSnapshot | null;
}

export interface LiveUpdateChanges {
  feed: boolean;
  interests: boolean;
  matches: boolean;
  notifications: boolean;
  settings: boolean;
  repairJobs: boolean;
}

export interface LiveUpdateDelayInput {
  hidden: boolean;
  snapshot: LiveUpdatesSnapshot | null;
  consecutiveFailures: number;
}

export interface LiveUpdatesEventDetail {
  snapshot: LiveUpdatesSnapshot;
  previousSnapshot: LiveUpdatesSnapshot | null;
  changes: LiveUpdateChanges;
}

export interface NewsPortalLiveUpdatesStore {
  snapshot: LiveUpdatesSnapshot | null;
  activeSurface: LiveUpdateSurface | null;
  forceRefresh?: () => void;
}

export const LIVE_UPDATES_EVENT = "newsportal:live-updates";
export const LIVE_UPDATES_IDLE_POLL_MS = 15_000;
export const LIVE_UPDATES_FAST_POLL_MS = 3_000;
export const LIVE_UPDATES_MAX_BACKOFF_MS = 60_000;

function normalizeRevisionPart(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function buildLiveRevision(parts: unknown[]): string {
  return parts.map((part) => normalizeRevisionPart(part)).join("|");
}

function metricChanged(
  previous: LiveMetricSnapshot | LiveSettingsSnapshot | null,
  next: LiveMetricSnapshot | LiveSettingsSnapshot | null
): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

export function diffLiveUpdates(
  previousSnapshot: LiveUpdatesSnapshot | null,
  nextSnapshot: LiveUpdatesSnapshot
): LiveUpdateChanges {
  if (!previousSnapshot) {
    return {
      feed: false,
      interests: false,
      matches: false,
      notifications: false,
      settings: false,
      repairJobs: false,
    };
  }

  return {
    feed: previousSnapshot.feed.revision !== nextSnapshot.feed.revision,
    interests:
      previousSnapshot.interests.revision !== nextSnapshot.interests.revision ||
      previousSnapshot.interests.queuedCount !== nextSnapshot.interests.queuedCount ||
      previousSnapshot.interests.failedCount !== nextSnapshot.interests.failedCount,
    matches: previousSnapshot.matches.revision !== nextSnapshot.matches.revision,
    notifications:
      previousSnapshot.notifications.revision !== nextSnapshot.notifications.revision,
    settings:
      metricChanged(previousSnapshot.settings, nextSnapshot.settings),
    repairJobs:
      JSON.stringify(previousSnapshot.repairJobs) !==
      JSON.stringify(nextSnapshot.repairJobs),
  };
}

export function hasPendingRepairJobs(snapshot: LiveUpdatesSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  return snapshot.repairJobs.some(
    (job) => job.status === "queued" || job.status === "running"
  );
}

export function hasPendingUserWork(snapshot: LiveUpdatesSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  return (
    snapshot.interests.queuedCount > 0 ||
    hasPendingRepairJobs(snapshot)
  );
}

export function resolveLiveUpdateDelay(input: LiveUpdateDelayInput): number | null {
  if (input.hidden) {
    return null;
  }

  const baseDelay = hasPendingUserWork(input.snapshot)
    ? LIVE_UPDATES_FAST_POLL_MS
    : LIVE_UPDATES_IDLE_POLL_MS;

  if (input.consecutiveFailures <= 0) {
    return baseDelay;
  }

  return Math.min(
    LIVE_UPDATES_MAX_BACKOFF_MS,
    baseDelay * Math.max(2, input.consecutiveFailures + 1)
  );
}

export function resolveSurfaceUpdateMessage(surface: LiveUpdateSurface): string {
  if (surface === "feed") {
    return "New system-selected articles available";
  }
  if (surface === "matches") {
    return "New personal matches available";
  }
  if (surface === "notifications") {
    return "New notification history available";
  }
  if (surface === "interests") {
    return "Your interest sync status changed";
  }
  return "Your settings changed";
}

export function resolveSurfaceHref(surface: LiveUpdateSurface): string {
  if (surface === "feed") {
    return "/";
  }
  return `/${surface}`;
}

export function serializeLiveUpdatesResponse(
  snapshot: LiveUpdatesSnapshot | null
): LiveUpdatesResponse {
  return {
    sessionActive: snapshot !== null,
    snapshot,
  };
}

declare global {
  interface Window {
    __newsportalLiveUpdates?: NewsPortalLiveUpdatesStore;
  }
}
