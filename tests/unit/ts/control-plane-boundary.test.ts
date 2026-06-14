import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const CONTROL_PLANE_SRC = join(process.cwd(), "runtime/node/packages/control-plane/src");

async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      return entry.isFile() && path.endsWith(".ts") ? [path] : [];
    })
  );
  return files.flat();
}

test("control-plane package does not import app-owned admin modules", async () => {
  const offenders: string[] = [];

  for (const file of await listTypeScriptFiles(CONTROL_PLANE_SRC)) {
    const source = await readFile(file, "utf8");
    if (/from\s+["'][^"']*apps\/admin|import\s*\([^)]*apps\/admin/.test(source)) {
      offenders.push(relative(process.cwd(), file));
    }
  }

  assert.deepEqual(offenders, []);
});
