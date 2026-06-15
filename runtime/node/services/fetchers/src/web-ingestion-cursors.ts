import type {
  CursorSnapshot,
  DiscoveredWebsiteResource,
} from "./web-ingestion-types";

export function compareIsoTimestamps(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }
  if (Number.isNaN(leftTime)) {
    return -1;
  }
  if (Number.isNaN(rightTime)) {
    return 1;
  }
  return leftTime - rightTime;
}

export function chooseLatest(left: string | null, right: string | null): string | null {
  return compareIsoTimestamps(left, right) >= 0 ? left : right;
}

export function selectLatestTimestamp(
  resources: readonly DiscoveredWebsiteResource[],
  markerType: "timestamp" | "lastmod"
): string | null {
  let latest: string | null = null;
  for (const resource of resources) {
    if (resource.freshnessMarkerType !== markerType || !resource.freshnessMarkerValue) {
      continue;
    }
    latest = chooseLatest(latest, resource.freshnessMarkerValue);
  }
  return latest;
}

export function matchesCursor(
  resource: DiscoveredWebsiteResource,
  cursors: Record<string, CursorSnapshot>
): boolean {
  if (resource.freshnessMarkerType === "timestamp" && resource.freshnessMarkerValue) {
    const previous = cursors.timestamp?.cursorValue;
    return previous != null && compareIsoTimestamps(resource.freshnessMarkerValue, previous) <= 0;
  }
  if (resource.freshnessMarkerType === "lastmod" && resource.freshnessMarkerValue) {
    const previous = cursors.lastmod?.cursorValue;
    return previous != null && compareIsoTimestamps(resource.freshnessMarkerValue, previous) <= 0;
  }

  const seenUrls = Array.isArray(cursors.set_diff?.cursorJson?.last_seen_urls)
    ? new Set(
        (cursors.set_diff?.cursorJson?.last_seen_urls as unknown[])
          .filter((item): item is string => typeof item === "string" && item.length > 0)
      )
    : new Set<string>();
  return seenUrls.has(resource.normalizedUrl);
}
