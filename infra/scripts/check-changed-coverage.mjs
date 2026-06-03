import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredPairs = [
  ["apps/admin/src/lib/server/admin-template-input.ts", "tests/unit/ts/admin-template-input.test.ts"],
  ["packages/bff-server/src/session-response.ts", "tests/unit/ts/bff-server-session.test.ts"],
  ["services/mcp/src/tools/content-analysis-helpers.ts", "tests/unit/ts/mcp-content-analysis-helpers.test.ts"],
  ["services/workers/app/candidate_signal_text.py", "tests/unit/python/test_candidate_signal_text.py"],
  ["services/api/app/content_selection_summary.py", "tests/unit/python/test_content_selection_summary.py"],
];

for (const [source, test] of requiredPairs) {
  if (!existsSync(source)) {
    console.error(`Missing changed helper module: ${source}`);
    process.exit(1);
  }
  if (!existsSync(test)) {
    console.error(`Missing direct helper test for ${source}: ${test}`);
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
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
  "--experimental-test-coverage",
  "tests/unit/ts/admin-template-input.test.ts",
  "tests/unit/ts/bff-server-session.test.ts",
  "tests/unit/ts/mcp-content-analysis-helpers.test.ts",
]);

run(process.env.PYTHON_COVERAGE_PYTHON ?? process.env.PYTHON_TEST_PYTHON ?? "python3", [
  "-m",
  "trace",
  "--count",
  "--summary",
  "--coverdir",
  "coverage/python-changed",
  "--module",
  "unittest",
  "tests.unit.python.test_candidate_signal_text",
  "tests.unit.python.test_content_selection_summary",
], {
  env: {
    ...process.env,
    PYTHONPATH: `.${process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : ""}`,
  },
});
