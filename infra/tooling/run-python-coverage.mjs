/* global console, process */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const cwd = process.cwd();
const python = process.env.PYTHON_COVERAGE_PYTHON ?? process.env.PYTHON_TEST_PYTHON ?? "python3";

function run(args, options = {}) {
  const result = spawnSync(python, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  return result;
}

const sysconfig = run([
  "-c",
  "import json, sysconfig; print(json.dumps([sysconfig.get_path('stdlib'), sysconfig.get_path('platstdlib')]))",
]);
if (sysconfig.status !== 0) {
  process.stderr.write(sysconfig.stderr);
  process.exit(sysconfig.status ?? 1);
}

const ignoredDirs = [
  ...new Set(JSON.parse(sysconfig.stdout.trim()).filter(Boolean)),
  join(cwd, ".venv"),
  join(cwd, "node_modules"),
];

const traceArgs = [
  "-m",
  "trace",
  "--count",
  "--summary",
  "--coverdir",
  "coverage/python",
  ...ignoredDirs.flatMap((dir) => ["--ignore-dir", dir]),
  "--module",
  "unittest",
  "discover",
  "-s",
  "tests/unit/python",
  "-p",
  "test_*.py",
];

const coverage = run(traceArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    PYTHONPATH: `tests/unit/python:.${process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : ""}`,
  },
});
process.exit(coverage.status ?? 1);
