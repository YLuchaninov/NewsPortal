import { execFileSync } from "node:child_process";

const runtimeImages = [
  "docker-web",
  "docker-admin",
  "docker-relay",
  "docker-migrate",
  "docker-fetchers",
  "docker-mcp",
  "docker-api",
  "docker-worker",
];

const shellCheck = `
set -eu
failed=0
for path in /workspace/tests /workspace/infra/scripts /workspace/infra/fixtures /workspace/.aidp; do
  if [ -e "$path" ]; then
    echo "$path"
    failed=1
  fi
done
env_path="$(find /workspace -path '/workspace/node_modules' -prune -o \\( -name '.env' -o -name '.env.*' \\) -print -quit)"
if [ -n "$env_path" ]; then
  echo "$env_path"
  failed=1
fi
if [ -d /workspace/data ]; then
  data_payload="$(find /workspace/data -mindepth 1 \\( -type f -o -type l \\) -print -quit)"
  if [ -n "$data_payload" ]; then
    echo "$data_payload"
    failed=1
  fi
fi
exit "$failed"
`;

const issues = [];

for (const image of runtimeImages) {
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore" });
  } catch {
    issues.push(`${image}: image is missing; build production compose images first.`);
    continue;
  }

  try {
    execFileSync("docker", ["run", "--rm", "--entrypoint", "/bin/sh", image, "-c", shellCheck], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const detail = [stdout, stderr].filter(Boolean).join("\n");
    issues.push(`${image}: forbidden release payload found${detail ? `\n${detail}` : ""}`);
  }
}

if (issues.length > 0) {
  console.error("Production image content check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `Production image content check passed: ${runtimeImages.length} runtime images contain no repo-owned tests, proof scripts, fixtures, AIDP state, env files or derived data files.`,
);
