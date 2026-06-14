import { canonicalizeUrl } from "./rss";

const SAME_SITE_PROTOCOLS = new Set(["http:", "https:"]);

export interface ParsedRobotsGroup {
  agents: string[];
  rules: Array<{ kind: "allow" | "disallow"; pattern: string }>;
  crawlDelaySeconds: number | null;
}

export interface ParsedRobotsPolicy {
  groups: ParsedRobotsGroup[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const absolute = baseUrl ? new URL(rawUrl, baseUrl).toString() : new URL(rawUrl).toString();
    const normalized = canonicalizeUrl(absolute);
    const parsed = new URL(normalized);
    if (!SAME_SITE_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function parseCrawlDelay(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function parseRobotsTxt(body: string): ParsedRobotsPolicy {
  const groups: ParsedRobotsGroup[] = [];
  let current: ParsedRobotsGroup | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const commentIndex = rawLine.indexOf("#");
    const line = (commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine).trim();
    if (!line) {
      current = null;
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const directive = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (directive === "user-agent") {
      if (!current) {
        current = {
          agents: [],
          rules: [],
          crawlDelaySeconds: null,
        };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) {
      continue;
    }
    if (directive === "allow" || directive === "disallow") {
      current.rules.push({
        kind: directive,
        pattern: value || "/",
      });
      continue;
    }
    if (directive === "crawl-delay") {
      current.crawlDelaySeconds = parseCrawlDelay(value);
    }
  }

  return { groups };
}

function ruleMatches(pathname: string, pattern: string): boolean {
  const anchored = pattern.endsWith("$");
  const normalizedPattern = anchored ? pattern.slice(0, -1) : pattern;
  const expression = new RegExp(
    `^${normalizedPattern.split("*").map(escapeRegExp).join(".*")}${anchored ? "$" : ""}`
  );
  return expression.test(pathname);
}

function findMatchingGroup(policy: ParsedRobotsPolicy, userAgent: string): ParsedRobotsGroup | null {
  const normalizedAgent = userAgent.trim().toLowerCase();
  let bestMatch: ParsedRobotsGroup | null = null;
  let bestLength = -1;

  for (const group of policy.groups) {
    for (const agent of group.agents) {
      if (agent === "*" || normalizedAgent.startsWith(agent)) {
        const length = agent === "*" ? 0 : agent.length;
        if (length > bestLength) {
          bestMatch = group;
          bestLength = length;
        }
      }
    }
  }

  return bestMatch;
}

export function isAllowedByRobots(body: string | null, rawUrl: string, userAgent: string): boolean {
  if (!body) {
    return true;
  }
  const group = findMatchingGroup(parseRobotsTxt(body), userAgent);
  if (!group) {
    return true;
  }

  const pathname = new URL(rawUrl).pathname || "/";
  const matches = group.rules
    .filter((rule) => ruleMatches(pathname, rule.pattern))
    .sort((left, right) => right.pattern.length - left.pattern.length);
  if (matches.length === 0) {
    return true;
  }
  if (matches.length > 1 && matches[0].pattern.length === matches[1].pattern.length) {
    if (matches[0].kind === "allow" || matches[1].kind === "allow") {
      return true;
    }
  }
  return matches[0]?.kind !== "disallow";
}

export function crawlDelayForUserAgent(body: string | null, userAgent: string): number | null {
  if (!body) {
    return null;
  }
  const group = findMatchingGroup(parseRobotsTxt(body), userAgent);
  return group?.crawlDelaySeconds ?? null;
}

export function extractSitemapUrlsFromRobots(body: string | null, baseUrl: string): string[] {
  if (!body) {
    return [];
  }
  const urls: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^sitemap:/i.test(line)) {
      continue;
    }
    const value = line.slice(line.indexOf(":") + 1).trim();
    const normalizedUrl = normalizeUrl(value, baseUrl);
    if (normalizedUrl) {
      urls.push(normalizedUrl);
    }
  }
  return Array.from(new Set(urls));
}
