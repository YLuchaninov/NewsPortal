import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ProbeUrlGuardResult {
  url: string | null;
  error: string | null;
}

type HostResolver = (hostname: string) => Promise<Array<{ address: string }>>;

export interface AcquisitionUrlGuardOptions {
  baseUrl?: string;
  resolveDns?: boolean;
  resolver?: HostResolver;
  privateHostAllowlist?: string[];
}

const MAX_PROBE_URL_LENGTH = 4096;
const PRIVATE_HOST_ALLOWLIST_ENV = "FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST";
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);
const IPV4_LOOPBACK = 127;
const IPV4_LINK_LOCAL_A = 169;
const IPV4_LINK_LOCAL_B = 254;
const IPV4_CARRIER_NAT_A = 100;
const IPV4_CARRIER_NAT_B_MIN = 64;
const IPV4_CARRIER_NAT_B_MAX = 127;
const IPV4_PRIVATE_10 = 10;
const IPV4_PRIVATE_172 = 172;
const IPV4_PRIVATE_172_B_MIN = 16;
const IPV4_PRIVATE_172_B_MAX = 31;
const IPV4_PRIVATE_192 = 192;
const IPV4_PRIVATE_192_B = 168;
const IPV4_BENCHMARK_A = 198;
const IPV4_BENCHMARK_B_MIN = 18;
const IPV4_BENCHMARK_B_MAX = 19;
const IPV4_MULTICAST_MIN = 224;

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "");
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c, d] = parts;
  return (
    a === 0 ||
    a === IPV4_PRIVATE_10 ||
    a === IPV4_LOOPBACK ||
    (a === IPV4_LINK_LOCAL_A && b === IPV4_LINK_LOCAL_B) ||
    (a === IPV4_CARRIER_NAT_A && b >= IPV4_CARRIER_NAT_B_MIN && b <= IPV4_CARRIER_NAT_B_MAX) ||
    (a === IPV4_PRIVATE_172 && b >= IPV4_PRIVATE_172_B_MIN && b <= IPV4_PRIVATE_172_B_MAX) ||
    (a === IPV4_PRIVATE_192 && b === IPV4_PRIVATE_192_B) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === IPV4_BENCHMARK_A && b >= IPV4_BENCHMARK_B_MIN && b <= IPV4_BENCHMARK_B_MAX) ||
    a >= IPV4_MULTICAST_MIN ||
    (a === 255 && b === 255 && c === 255 && d === 255)
  );
}

function ipv4FromMappedIpv6(hostname: string): string | null {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  if (!normalized.startsWith("::ffff:")) {
    return null;
  }
  const suffix = normalized.slice("::ffff:".length);
  if (isIP(suffix) === 4) {
    return suffix;
  }
  const groups = suffix.split(":");
  if (groups.length !== 2) {
    return null;
  }
  const first = Number.parseInt(groups[0] ?? "", 16);
  const second = Number.parseInt(groups[1] ?? "", 16);
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(second) ||
    first < 0 ||
    first > 0xffff ||
    second < 0 ||
    second > 0xffff
  ) {
    return null;
  }
  return [
    (first >> 8) & 0xff,
    first & 0xff,
    (second >> 8) & 0xff,
    second & 0xff,
  ].join(".");
}

function isUnsafeIpv6(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4);
  }
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  if (!normalized || BLOCKED_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isUnsafeIpv6(normalized);
  }

  return false;
}

function readPrivateHostAllowlist(): string[] {
  return String(process.env[PRIVATE_HOST_ALLOWLIST_ENV] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isPrivateHostAllowlisted(parsed: URL, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }
  const hostname = stripIpv6Brackets(parsed.hostname).toLowerCase();
  const hostWithPort = parsed.port ? `${hostname}:${parsed.port}` : hostname;
  return allowlist.some((entry) => entry === hostWithPort || (!entry.includes(":") && entry === hostname));
}

function normalizeProbeUrlSyntax(
  rawUrl: string,
  baseUrl?: string,
  privateHostAllowlist: readonly string[] = [],
): ProbeUrlGuardResult {
  const value = String(rawUrl ?? "").trim();
  if (!value) {
    return { url: null, error: "Probe URL is empty." };
  }
  if (value.length > MAX_PROBE_URL_LENGTH) {
    return { url: null, error: "Probe URL is too long." };
  }
  if (value.startsWith("//")) {
    return { url: null, error: "Protocol-relative probe URLs are not allowed." };
  }

  let parsed: URL;
  try {
    parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    return { url: null, error: "Probe URL is malformed." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { url: null, error: "Probe URL must use http or https." };
  }
  if (parsed.username || parsed.password) {
    return { url: null, error: "Probe URL credentials are not allowed." };
  }
  if (isBlockedHostname(parsed.hostname) && !isPrivateHostAllowlisted(parsed, privateHostAllowlist)) {
    return { url: null, error: "Probe URL host is not allowed." };
  }

  return { url: parsed.toString(), error: null };
}

async function resolveHostname(hostname: string, resolver?: HostResolver): Promise<Array<{ address: string }>> {
  if (resolver) {
    return resolver(hostname);
  }
  return lookup(hostname, { all: true });
}

export function normalizeProbeUrl(rawUrl: string, baseUrl?: string): ProbeUrlGuardResult {
  return normalizeProbeUrlSyntax(rawUrl, baseUrl);
}

export async function validateAcquisitionUrl(
  rawUrl: string,
  options: AcquisitionUrlGuardOptions = {},
): Promise<ProbeUrlGuardResult> {
  const privateHostAllowlist = (options.privateHostAllowlist ?? readPrivateHostAllowlist()).map((item) =>
    item.trim().toLowerCase(),
  );
  const normalized = normalizeProbeUrlSyntax(rawUrl, options.baseUrl, privateHostAllowlist);
  if (!normalized.url || !options.resolveDns) {
    return normalized;
  }

  const parsed = new URL(normalized.url);
  if (isPrivateHostAllowlisted(parsed, privateHostAllowlist)) {
    return normalized;
  }
  if (isIP(stripIpv6Brackets(parsed.hostname))) {
    return normalized;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolveHostname(parsed.hostname, options.resolver);
  } catch {
    return { url: null, error: "Probe URL host could not be resolved." };
  }

  if (addresses.length === 0) {
    return { url: null, error: "Probe URL host did not resolve to an address." };
  }
  const blocked = addresses.find((item) => isBlockedHostname(item.address));
  if (blocked) {
    return {
      url: null,
      error: `Probe URL host resolved to a blocked address (${blocked.address}).`,
    };
  }
  return normalized;
}

export function dedupeProbeUrls(rawUrls: string[], limit = 10): { urls: string[]; rejected: Array<{ url: string; error: string }> } {
  const urls: string[] = [];
  const rejected: Array<{ url: string; error: string }> = [];
  const seen = new Set<string>();

  for (const rawUrl of rawUrls) {
    const normalized = normalizeProbeUrl(rawUrl);
    if (!normalized.url) {
      rejected.push({ url: rawUrl, error: normalized.error ?? "Probe URL is not allowed." });
      continue;
    }
    if (seen.has(normalized.url)) {
      continue;
    }
    seen.add(normalized.url);
    urls.push(normalized.url);
    if (urls.length >= limit) {
      break;
    }
  }

  return { urls, rejected };
}
