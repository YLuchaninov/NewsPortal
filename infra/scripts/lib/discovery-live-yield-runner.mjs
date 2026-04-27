import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

import { parseJsonArtifactPath } from "./discovery-live-yield-report.mjs";

export function runSingleDiscoveryExamplesHarness({ iteration, runId, repoRoot }) {
  console.log(`[live-discovery-yield-proof] Starting live discovery harness run ${iteration}.`);
  const pointerPath = `/tmp/newsportal-live-discovery-yield-run-${runId}-${iteration}.json`;
  const result = spawnSync("node", ["infra/scripts/test-live-discovery-examples.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DISCOVERY_ENABLED: "1",
      DISCOVERY_EXAMPLES_SKIP_PREFLIGHT: "1",
      DISCOVERY_EXAMPLES_SKIP_STACK_RESET: "1",
      DISCOVERY_EXAMPLES_ARTIFACT_POINTER_FILE: pointerPath,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let jsonPath;
  try {
    const pointer = JSON.parse(readFileSync(pointerPath, "utf8"));
    jsonPath = String(pointer?.jsonPath ?? "").trim();
  } catch {
    jsonPath = parseJsonArtifactPath(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return {
    status: result.status ?? 1,
    jsonPath,
  };
}
