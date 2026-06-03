import { spawnSync } from "node:child_process";

const cwd = process.cwd();

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("node", [
  "--import",
  "tsx",
  "--test",
  "--test-concurrency=1",
  "tests/unit/ts/web-action-kit.test.ts",
  "tests/unit/ts/bff-server-session.test.ts",
  "tests/unit/ts/mcp-content-analysis-helpers.test.ts",
  "tests/unit/ts/admin-template-input.test.ts",
]);

run(process.env.PYTHON_TEST_PYTHON ?? "python3", [
  "-m",
  "unittest",
  "tests.unit.python.test_candidate_signal_text",
  "tests.unit.python.test_content_selection_summary",
], {
  env: {
    ...process.env,
    PYTHONPATH: `.${process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : ""}`,
  },
});
