import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function findRepoRoot(fromImportMetaUrl = import.meta.url): Promise<string> {
  const startDir = path.dirname(fileURLToPath(fromImportMetaUrl));
  const candidates = new Set<string>();

  for (const origin of [process.cwd(), startDir]) {
    let current = path.resolve(origin);
    while (true) {
      candidates.add(current);
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "pnpm-workspace.yaml"))) {
      return candidate;
    }
  }

  throw new Error("Could not locate repository root from fetchers runtime path.");
}
