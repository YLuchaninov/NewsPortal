import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const adminServerDir = path.join(repoRoot, "runtime/node/apps/admin/src/lib/server");
const controlPlaneDir = path.join(repoRoot, "runtime/node/packages/control-plane/src");

const issues = [];
const allowedAdminServerModules = new Set([
  "admin-action",
  "admin-payload-validation",
  "admin-template-input",
  "auth",
  "automation",
  "automation-workspace",
  "browser-flow",
  "channel-scheduling",
  "db",
  "live-updates",
  "mcp-token-workspace",
  "operator-surfaces",
  "request",
  "user-interest-admin-page",
  "user-interests",
]);
const controlPlaneModules = new Set(
  fs.readdirSync(controlPlaneDir)
    .filter((file) => file.endsWith(".ts") && file !== "index.ts")
    .map((file) => path.basename(file, ".ts"))
);

for (const file of fs.readdirSync(adminServerDir).filter((item) => item.endsWith(".ts"))) {
  const moduleName = path.basename(file, ".ts");
  if (allowedAdminServerModules.has(moduleName)) {
    continue;
  }

  const adminPath = path.join(adminServerDir, file);
  if (controlPlaneModules.has(moduleName)) {
    issues.push(
      `${path.relative(repoRoot, adminPath)} overlaps runtime/node/packages/control-plane/src/${file}; import @signalops/control-plane/${moduleName} directly instead of adding admin server wrappers.`
    );
    continue;
  }

  issues.push(
    `${path.relative(repoRoot, adminPath)} is not in the BFF-only admin server allowlist.`
  );
}

if (issues.length > 0) {
  console.error("Control-plane ownership check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Control-plane ownership check passed: admin server modules are BFF-only and do not overlap control-plane ownership.");
