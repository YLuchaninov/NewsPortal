import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const dockerfiles = [
  "infra/docker/admin.Dockerfile",
  "infra/docker/fetchers.Dockerfile",
  "infra/docker/mcp.Dockerfile",
  "infra/docker/python-app.Dockerfile",
  "infra/docker/relay.Dockerfile",
  "infra/docker/web.Dockerfile",
];

const forbiddenCopyPatterns = [
  /^\.aidp(?:\/|$)/,
  /^\.env(?:\.|$)/,
  /^\.git(?:\/|$)/,
  /^\.pytest_cache(?:\/|$)/,
  /^\.ruff_cache(?:\/|$)/,
  /^apps\/[^/]+\/dist(?:\/|$)/,
  /^apps\/[^/]+\/\.astro(?:\/|$)/,
  /^data(?:\/|$)/,
  /^docs(?:\/|$)/,
  /^infra\/scripts(?:\/|$)/,
  /^node_modules(?:\/|$)/,
  /^tests(?:\/|$)/,
  /(?:^|\/)__pycache__(?:\/|$)/,
  /(?:^|\/)python\.dev-requirements\.txt$/,
  /(?:^|\/)python\.optional-ml-requirements\.txt$/,
];

const allowedComposeBindMounts = new Set([
  "../../data:/workspace/data",
  "../nginx/default.conf:/etc/nginx/conf.d/default.conf:ro",
]);

const forbiddenDependencyNames = new Set([
  `@extractus/${["feed", "extractor"].join("-")}`,
]);

const packageRoots = ["packages", "apps", "services"];
const issues = [];
const compiledRuntimePackages = new Map([
  [
    "services/fetchers/package.json",
    [
      "signal-candidate-yield:diagnostics",
      "signal-candidate-yield:remediate",
      "replay:website-projections",
      "run:once",
      "start",
    ],
  ],
  ["services/mcp/package.json", ["start"]],
  ["services/relay/package.json", ["migrate", "start"]],
]);
const compiledRuntimeDockerfiles = [
  "infra/docker/fetchers.Dockerfile",
  "infra/docker/mcp.Dockerfile",
  "infra/docker/relay.Dockerfile",
];
const nodeRuntimeDockerfiles = new Map([
  ["infra/docker/admin.Dockerfile", /CMD\s+\["node",\s*"apps\/admin\/dist\/server\/entry\.mjs"\]/],
  ["infra/docker/fetchers.Dockerfile", /CMD\s+\["node",\s*"services\/fetchers\/dist\/main\.mjs"\]/],
  ["infra/docker/mcp.Dockerfile", /CMD\s+\["node",\s*"services\/mcp\/dist\/main\.mjs"\]/],
  ["infra/docker/relay.Dockerfile", /CMD\s+\["node",\s*"services\/relay\/dist\/main\.mjs"\]/],
  ["infra/docker/web.Dockerfile", /CMD\s+\["node",\s*"apps\/web\/dist\/server\/entry\.mjs"\]/],
]);
const pythonRuntimeDockerfile = "infra/docker/python-app.Dockerfile";
const forbiddenBaselinePythonRequirementPatterns = [
  /^sentence-transformers==/i,
  /^torch==/i,
  /^nvidia-/i,
  /^cuda-/i,
  /^triton==/i,
];
const finalNodeRuntimeForbiddenPatterns = [
  /\bCOPY\b(?![^\n]*--from=)[^\n]*(?:^|\s)(?:services|packages|apps)\/[^/\s]+\/src(?:\s|\/|$)/im,
  /\bCOPY\b(?![^\n]*--from=)[^\n]*(?:^|\s)infra\/tooling(?:\s|\/|$)/im,
  /\bCOPY\b(?![^\n]*--from=)[^\n]*(?:^|\s)tsconfig(?:\.base)?\.json(?:\s|$)/im,
  /\bCOPY\b(?![^\n]*--from=)[^\n]*(?:^|\s)turbo\.json(?:\s|$)/im,
  /\bRUN\b[^\n]*build-node-runtime\.mjs/im,
];

function readText(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function normalizeCopySource(source) {
  return source
    .replace(/^--[^\s]+\s+/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^\.\//, "");
}

function extractCopySources(line) {
  const trimmed = line.trim();
  if (!/^(COPY|ADD)\s+/i.test(trimmed)) {
    return [];
  }
  const withoutInstruction = trimmed.replace(/^(COPY|ADD)\s+/i, "").trim();
  if (withoutInstruction.startsWith("--from=")) {
    return [];
  }
  if (withoutInstruction.startsWith("[")) {
    try {
      const parts = JSON.parse(withoutInstruction);
      return Array.isArray(parts) ? parts.slice(0, -1).map((item) => normalizeCopySource(String(item))) : [];
    } catch {
      issues.push(`Could not parse JSON-form COPY/ADD instruction: ${trimmed}`);
      return [];
    }
  }
  const parts = withoutInstruction.split(/\s+/).filter(Boolean);
  return parts.slice(0, -1).map(normalizeCopySource);
}

function checkDockerfile(file) {
  const text = readText(file);
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    for (const source of extractCopySources(line)) {
      for (const pattern of forbiddenCopyPatterns) {
        if (pattern.test(source)) {
          issues.push(`${file}:${index + 1} copies forbidden runtime artifact source "${source}".`);
        }
      }
    }
  }
}

function checkCompose() {
  const prodText = readText("infra/docker/compose.prod.yml");
  if (prodText.includes(".env.dev") || prodText.includes(".env.example")) {
    issues.push("infra/docker/compose.prod.yml must not reference development/example env files.");
  }

  const composeText = readText("infra/docker/compose.yml");
  for (const runtimeCommand of [
    `["pnpm", "db:migrate"]`,
    `["pnpm", "--filter", "@signalops/relay", "start"]`,
    `["pnpm", "--filter", "@signalops/fetchers", "start"]`,
    `["pnpm", "--filter", "@signalops/mcp", "start"]`,
    `["pnpm", "--filter", "@signalops/web", "start"]`,
    `["pnpm", "--filter", "@signalops/admin", "start"]`,
  ]) {
    if (composeText.includes(runtimeCommand)) {
      issues.push(
        `infra/docker/compose.yml must not override compiled Node runtime command with ${runtimeCommand}.`
      );
    }
  }
  for (const [index, line] of composeText.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*-\s+["']?([^"'\n]+)["']?\s*$/);
    if (!match) {
      continue;
    }
    const mount = match[1].trim();
    if (!mount.startsWith("../") && !mount.startsWith("../../")) {
      continue;
    }
    if (!allowedComposeBindMounts.has(mount)) {
      issues.push(`infra/docker/compose.yml:${index + 1} has unapproved host bind mount "${mount}".`);
    }
  }
}

function packageJsonPaths() {
  const files = ["package.json"];
  for (const root of packageRoots) {
    const rootPath = path.join(repoRoot, root);
    if (!fs.existsSync(rootPath)) {
      continue;
    }
    for (const child of fs.readdirSync(rootPath, { withFileTypes: true })) {
      if (child.isDirectory()) {
        const candidate = path.join(root, child.name, "package.json");
        if (fs.existsSync(path.join(repoRoot, candidate))) {
          files.push(candidate);
        }
      }
    }
  }
  return files;
}

function checkPackageManifests() {
  for (const file of packageJsonPaths()) {
    const manifest = JSON.parse(readText(file));
    for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const deps = manifest[key] ?? {};
      for (const name of Object.keys(deps)) {
        if (forbiddenDependencyNames.has(name)) {
          issues.push(`${file} declares forbidden dependency ${name}.`);
        }
      }
    }
  }

  const lockfile = readText("pnpm-lock.yaml");
  for (const name of forbiddenDependencyNames) {
    if (lockfile.includes(name)) {
      issues.push(`pnpm-lock.yaml still references forbidden dependency ${name}.`);
    }
  }
}

function checkCompiledRuntimeEntrypoints() {
  for (const [file, scriptNames] of compiledRuntimePackages) {
    const manifest = JSON.parse(readText(file));
    for (const scriptName of scriptNames) {
      const script = manifest.scripts?.[scriptName];
      if (typeof script !== "string") {
        issues.push(`${file} is missing runtime script "${scriptName}".`);
        continue;
      }
      if (script.includes("--import tsx") || /\bsrc\/.+\.ts\b/.test(script)) {
        issues.push(`${file} script "${scriptName}" must run compiled dist output, not TS source.`);
      }
      if (!/\bdist\/.+\.mjs\b/.test(script)) {
        issues.push(`${file} script "${scriptName}" must point at a compiled .mjs entrypoint.`);
      }
    }
  }

  for (const file of compiledRuntimeDockerfiles) {
    const text = readText(file);
    if (text.includes("--import tsx") || /\bsrc\/.+\.ts\b/.test(text)) {
      issues.push(`${file} must not start production Node services through TS source loaders.`);
    }
    if (!text.includes("build-node-runtime.mjs")) {
      issues.push(`${file} must build compiled Node runtime outputs during image build.`);
    }
    if (!/CMD\s+\["node",\s*"services\/.+\/dist\/.+\.mjs"\]/.test(text)) {
      issues.push(`${file} CMD must run a compiled dist .mjs entrypoint directly.`);
    }
  }

  for (const [file, expectedCommandPattern] of nodeRuntimeDockerfiles) {
    const text = readText(file);
    const stages = text.split(/^FROM\s+/im).filter(Boolean);
    const finalStage = stages.at(-1) ?? "";
    if (!/^FROM\s+node:[^\n]+\s+AS\s+runtime\b/im.test(`FROM ${finalStage}`)) {
      issues.push(`${file} final stage must be an explicit Node runtime stage.`);
    }
    if (!/\bRUN\b[\s\S]*?pnpm\s+install[\s\S]*?--prod[\s\S]*?--filter/im.test(finalStage)) {
      issues.push(`${file} final runtime stage must install only production dependencies for the service filter.`);
    }
    if (!/\bUSER\s+node\b/im.test(finalStage)) {
      issues.push(`${file} final runtime stage must drop privileges with USER node.`);
    }
    if (/\bUSER\s+root\b/im.test(finalStage)) {
      issues.push(`${file} final runtime stage must not switch back to root.`);
    }
    if (!expectedCommandPattern.test(text)) {
      issues.push(`${file} CMD must run its compiled dist entrypoint directly.`);
    }
    if (/CMD\s+\["pnpm"/.test(text)) {
      issues.push(`${file} CMD must not start through pnpm in the runtime image.`);
    }
    for (const pattern of finalNodeRuntimeForbiddenPatterns) {
      if (pattern.test(finalStage)) {
        issues.push(`${file} final runtime stage copies or runs build/source-only inputs.`);
        break;
      }
    }
  }
}

function checkPythonRuntimeImage() {
  const file = pythonRuntimeDockerfile;
  const text = readText(file);
  const stages = text.split(/^FROM\s+/im).filter(Boolean);
  const finalStage = stages.at(-1) ?? "";
  const finalStageText = `FROM ${finalStage}`;

  if (!/^FROM\s+python:[^\n]+\s+AS\s+runtime\b/im.test(finalStageText)) {
    issues.push(`${file} final stage must be an explicit Python runtime stage.`);
  }
  if (!/\bFROM\s+python:[^\n]+\s+AS\s+builder\b/im.test(text)) {
    issues.push(`${file} must build Python wheels in a separate builder stage.`);
  }
  if (!/\bARG\s+PYTHON_APP_UID=/im.test(finalStageText) || !/\bARG\s+PYTHON_APP_GID=/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must expose PYTHON_APP_UID/PYTHON_APP_GID build args.`);
  }
  if (!/\bUSER\s+signalops\b/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must drop privileges with USER signalops.`);
  }
  if (/\bUSER\s+root\b/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must not switch back to root.`);
  }
  if (/\bCOPY\b(?![^\n]*--from=)[^\n]*(?:^|\s)data(?:\s|\/|$)/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must not bake local derived data into the image.`);
  }
  if (/\bapt-get\s+install\b[^\n]*build-essential/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must not install build-essential.`);
  }
  if (!/\bCOPY\s+--from=builder\s+\/tmp\/wheels\s+\/tmp\/wheels\b/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must install dependencies from builder wheels.`);
  }
  if (!/\bpip\s+install\b[^\n]*--no-index[^\n]*--find-links=\/tmp\/wheels/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must install Python dependencies from local wheels.`);
  }
  if (!/\bchown\s+-R\s+signalops:signalops\s+\/workspace\b/im.test(finalStageText)) {
    issues.push(`${file} final runtime stage must make /workspace owned by the non-root runtime user.`);
  }

  const composeText = readText("infra/docker/compose.yml");
  for (const serviceName of ["worker", "api"]) {
    const servicePattern = new RegExp(
      `${serviceName}:\\n[\\s\\S]*?dockerfile: infra/docker/python-app\\.Dockerfile[\\s\\S]*?PYTHON_APP_UID: \\$\\{PYTHON_APP_UID:-10001\\}[\\s\\S]*?PYTHON_APP_GID: \\$\\{PYTHON_APP_GID:-10001\\}`,
      "m",
    );
    if (!servicePattern.test(composeText)) {
      issues.push(`infra/docker/compose.yml ${serviceName} build must pass PYTHON_APP_UID/PYTHON_APP_GID args.`);
    }
  }
}

function checkPythonRuntimeRequirements() {
  const file = "infra/docker/python.requirements.txt";
  const text = readText(file);
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (forbiddenBaselinePythonRequirementPatterns.some((pattern) => pattern.test(line))) {
      issues.push(`${file}:${index + 1} keeps heavy neural/CUDA dependency "${line}" in the baseline runtime image.`);
    }
  }
}

for (const file of dockerfiles) {
  checkDockerfile(file);
}
checkCompose();
checkPackageManifests();
checkCompiledRuntimeEntrypoints();
checkPythonRuntimeImage();
checkPythonRuntimeRequirements();

if (issues.length > 0) {
  console.error("Runtime artifact check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `Runtime artifact check passed: ${dockerfiles.length} Dockerfiles, compose runtime mounts and ${packageJsonPaths().length} manifests checked.`,
);
