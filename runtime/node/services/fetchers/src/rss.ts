const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const parsed = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(parsed) ? `&${entity};` : String.fromCodePoint(parsed);
    }

    if (entity.startsWith("#")) {
      const parsed = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(parsed) ? `&${entity};` : String.fromCodePoint(parsed);
    }

    return HTML_ENTITY_MAP[entity] ?? `&${entity};`;
  });
}

export function stripHtmlTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";

  const paramsToDelete = new Set<string>();
  for (const key of url.searchParams.keys()) {
    const lowerKey = key.toLowerCase();

    if (
      lowerKey.startsWith("utm_") ||
      lowerKey === "fbclid" ||
      lowerKey === "gclid" ||
      lowerKey === "mc_cid" ||
      lowerKey === "mc_eid"
    ) {
      paramsToDelete.add(key);
    }
  }

  for (const key of paramsToDelete) {
    url.searchParams.delete(key);
  }

  url.searchParams.sort();
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}
