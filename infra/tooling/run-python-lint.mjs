/* global console, process */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const candidates = [
  process.env.PYTHON_LINT_PYTHON,
  existsSync(".venv/bin/python") ? ".venv/bin/python" : undefined,
  "python3",
].filter(Boolean);

const args = ["-m", "ruff", "check", ...(process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["services", "infra/scripts"])];
const failures = [];

for (const executable of candidates) {
  const result = spawnSync(executable, args, { stdio: "inherit" });
  if (result.error) {
    failures.push(`${executable}: ${result.error.message}`);
    continue;
  }
  process.exit(result.status ?? 1);
}

console.error("Python lint failed: no usable Python executable found for Ruff.");
for (const failure of failures) {
  console.error(`- ${failure}`);
}
process.exit(1);
