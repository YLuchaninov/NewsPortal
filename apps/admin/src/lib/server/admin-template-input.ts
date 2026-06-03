export interface CandidateSignalGroup {
  name: string;
  cues: string[];
}

export function readTextList(value: unknown, options: { splitCommas?: boolean } = {}): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => String(entry ?? "").split("\n"))
    .flatMap((entry) => (options.splitCommas ? entry.split(",") : [entry]))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function slugifyCandidateSignalName(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function parseCandidateSignalGroups(value: unknown): CandidateSignalGroup[] {
  const lines = readTextList(value);
  const groups: CandidateSignalGroup[] = [];

  for (const [index, line] of lines.entries()) {
    const separatorIndex = line.indexOf(":");
    const rawName = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : "";
    const rawCueBlock = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : line;
    const cues = rawCueBlock
      .split(/[|,]/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (cues.length === 0) {
      continue;
    }

    groups.push({
      name: slugifyCandidateSignalName(rawName, `group_${index + 1}`),
      cues,
    });
  }

  return groups;
}

export function normalizeCandidateSignalGroup(value: unknown): CandidateSignalGroup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const cues = Array.isArray(record.cues)
    ? record.cues.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : Array.isArray(record.terms)
      ? record.terms.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
  if (cues.length === 0) {
    return null;
  }

  return {
    name: slugifyCandidateSignalName(String(record.name ?? ""), "group"),
    cues,
  };
}

export function normalizeCandidateSignalGroups(value: unknown): CandidateSignalGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeCandidateSignalGroup(entry))
    .filter((entry): entry is CandidateSignalGroup => entry !== null);
}
