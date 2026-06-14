/* global console, process */
import { spawnSync } from "node:child_process";

const python = process.env.PYTHON_TEST_PYTHON ?? "python3";

const result = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "tests/unit/python", "-p", "test_*.py"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONPATH: `runtime/python/src:tests/unit/python:.${process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : ""}`,
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
