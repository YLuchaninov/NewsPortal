import fs from "node:fs";
import path from "node:path";

import { validateNodeDependencySpec } from "./lib/dependency-specs.mjs";

const repoRoot = process.cwd();
const packageRootDirs = ["packages", "apps", "services"];
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const allowedLicenseTokens = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);

const forbiddenDependencyNames = new Set([
  `@extractus/${["feed", "extractor"].join("-")}`,
]);

const forbiddenBaselinePythonRequirements = [
  /^sentence-transformers==/i,
  /^torch==/i,
  /^nvidia-/i,
  /^cuda-/i,
  /^triton==/i,
];

const issues = [];
const directDependencyInventory = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));
}

function packageJsonPaths() {
  const files = ["package.json"];
  for (const root of packageRootDirs) {
    const rootPath = path.join(repoRoot, root);
    if (!fs.existsSync(rootPath)) {
      continue;
    }
    for (const child of fs.readdirSync(rootPath, { withFileTypes: true })) {
      if (!child.isDirectory()) {
        continue;
      }
      const file = path.join(root, child.name, "package.json");
      if (fs.existsSync(path.join(repoRoot, file))) {
        files.push(file);
      }
    }
  }
  return files;
}

function dependencyPackageJsonPath(manifestFile, dependencyName) {
  return path.join(
    repoRoot,
    path.dirname(manifestFile),
    "node_modules",
    ...dependencyName.split("/"),
    "package.json",
  );
}

function normalizeLicenseValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLicenseValue(item.type ?? item)).join(" OR ");
  }
  return "";
}

function isAllowedLicense(license) {
  const normalized = license
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND)\s+|\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.some((token) => allowedLicenseTokens.has(token));
}

function checkNodeDependency(manifestFile, section, name, spec) {
  const specText = String(spec);
  if (specText.startsWith("workspace:")) {
    return;
  }
  if (forbiddenDependencyNames.has(name)) {
    issues.push(`${manifestFile} declares forbidden dependency ${name}.`);
  }
  for (const issue of validateNodeDependencySpec(name, specText)) {
    issues.push(`${manifestFile} declares invalid dependency spec: ${issue}`);
  }

  const metadataPath = dependencyPackageJsonPath(manifestFile, name);
  if (!fs.existsSync(metadataPath)) {
    issues.push(`${manifestFile} dependency ${name} is missing installed package metadata; run pnpm install before compliance proof.`);
    return;
  }
  const dependencyMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const license = normalizeLicenseValue(dependencyMetadata.license ?? dependencyMetadata.licenses);
  directDependencyInventory.push({
    manifest: manifestFile,
    section,
    name,
    version: dependencyMetadata.version ?? "unknown",
    license: license || "unknown",
  });
  if (!license || !isAllowedLicense(license)) {
    issues.push(`${manifestFile} dependency ${name} has unapproved or unknown license "${license || "unknown"}".`);
  }
}

function checkNodeManifests() {
  for (const manifestFile of packageJsonPaths()) {
    const manifest = readJson(manifestFile);
    for (const section of dependencySections) {
      const dependencies = manifest[section] ?? {};
      for (const [name, spec] of Object.entries(dependencies)) {
        checkNodeDependency(manifestFile, section, name, spec);
      }
    }
  }
}

function checkPythonRequirements(file, { exactPinsRequired, forbidBaselineHeavyMl = false }) {
  const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("-")) {
      issues.push(`${file}:${index + 1} uses an unsupported requirements directive.`);
      continue;
    }
    if (/^(git\+|https?:|file:)/i.test(line)) {
      issues.push(`${file}:${index + 1} uses a network/path requirement.`);
      continue;
    }
    if (exactPinsRequired && !/^[A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.-]+\])?==[A-Za-z0-9_.!+-]+$/.test(line)) {
      issues.push(`${file}:${index + 1} must be exactly pinned with ==.`);
    }
    if (
      forbidBaselineHeavyMl
      && forbiddenBaselinePythonRequirements.some((pattern) => pattern.test(line))
    ) {
      issues.push(`${file}:${index + 1} must keep heavy neural/CUDA ML dependencies out of the baseline runtime image.`);
    }
  }
}

checkNodeManifests();
checkPythonRequirements("infra/docker/python.requirements.txt", {
  exactPinsRequired: true,
  forbidBaselineHeavyMl: true,
});
checkPythonRequirements("infra/docker/python.optional-ml-requirements.txt", { exactPinsRequired: true });
checkPythonRequirements("infra/docker/python.dev-requirements.txt", { exactPinsRequired: false });

if (issues.length > 0) {
  console.error("Dependency compliance check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

const uniqueDirectDependencies = new Set(directDependencyInventory.map((item) => item.name));
const licenseSummary = [...new Set(directDependencyInventory.map((item) => item.license))].sort();
console.log(
  `Dependency compliance check passed: ${uniqueDirectDependencies.size} direct Node dependencies checked; licenses: ${licenseSummary.join(", ")}; Python runtime requirements are pinned.`,
);
