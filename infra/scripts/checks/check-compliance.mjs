import { spawnSync } from "node:child_process";

const checks = [
  ["check:scaffold", ["pnpm", "check:scaffold"]],
  ["check:repo-taxonomy", ["pnpm", "check:repo-taxonomy"]],
  ["check:runtime-artifacts", ["pnpm", "check:runtime-artifacts"]],
  ["check:control-plane-ownership", ["pnpm", "check:control-plane-ownership"]],
  ["check:beta-route-exposure", ["pnpm", "check:beta-route-exposure"]],
  ["check:dependency-compliance", ["pnpm", "check:dependency-compliance"]],
  ["check:operator-truth-parity", ["pnpm", "check:operator-truth-parity"]],
  ["check:supply-chain-inventory", ["pnpm", "check:supply-chain-inventory"]],
  ["check:env-sync", ["pnpm", "check:env-sync"]],
  ["check:secret-leaks", ["pnpm", "check:secret-leaks"]],
];

for (const [name, [command, ...args]] of checks) {
  console.log(`[compliance] running ${name}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(`[compliance] ${name} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[compliance] ${name} failed with exit code ${result.status ?? "unknown"}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`[compliance] passed: ${checks.map(([name]) => name).join(", ")}`);
