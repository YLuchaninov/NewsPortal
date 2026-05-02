import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const packageRootDirs = ["packages", "apps", "services"];
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const pythonRequirementFiles = [
  "infra/docker/python.requirements.txt",
  "infra/docker/python.optional-ml-requirements.txt",
  "infra/docker/python.dev-requirements.txt",
];
const hashFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ...pythonRequirementFiles,
];

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const jsonOutput = args.includes("--json");
const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;
if (outputIndex >= 0 && !outputFile) {
  console.error("Usage: pnpm check:supply-chain-inventory [--json] [--output <file>]");
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(path.join(repoRoot, file)));
  return hash.digest("hex");
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
  return files.sort();
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

function parseRequirementLine(rawLine, lineNumber, file) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) {
    return null;
  }
  const exactPinMatch = line.match(/^([A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.-]+\])?)==(.+)$/);
  return {
    file,
    lineNumber,
    requirement: line,
    packageName: exactPinMatch?.[1] ?? line.split(/[<>=!~\s]/)[0],
    pinnedExact: Boolean(exactPinMatch),
    version: exactPinMatch?.[2] ?? null,
  };
}

function buildNodeInventory(manifestFiles, issues) {
  const manifests = [];
  const dependencies = [];
  for (const manifestFile of manifestFiles) {
    const manifest = readJson(manifestFile);
    const manifestDependencies = [];
    for (const section of dependencySections) {
      const sectionDependencies = manifest[section] ?? {};
      for (const [name, spec] of Object.entries(sectionDependencies)) {
        const specText = String(spec);
        const isWorkspace = specText.startsWith("workspace:");
        const dependency = {
          manifest: manifestFile,
          packageName: manifest.name ?? null,
          section,
          name,
          spec: specText,
          workspace: isWorkspace,
          installedVersion: null,
          license: null,
        };
        if (!isWorkspace) {
          const metadataPath = dependencyPackageJsonPath(manifestFile, name);
          if (!fs.existsSync(metadataPath)) {
            issues.push(`${manifestFile} dependency ${name} is missing installed package metadata.`);
          } else {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
            dependency.installedVersion = metadata.version ?? "unknown";
            dependency.license = normalizeLicenseValue(metadata.license ?? metadata.licenses) || "unknown";
          }
        }
        dependencies.push(dependency);
        manifestDependencies.push({
          section,
          name,
          spec: specText,
          workspace: isWorkspace,
        });
      }
    }
    manifests.push({
      file: manifestFile,
      name: manifest.name ?? null,
      private: Boolean(manifest.private),
      dependencyCount: manifestDependencies.length,
      dependencies: manifestDependencies,
    });
  }
  return { manifests, dependencies };
}

function buildPythonInventory(issues) {
  const requirements = [];
  for (const file of pythonRequirementFiles) {
    if (!fs.existsSync(path.join(repoRoot, file))) {
      issues.push(`${file} is missing.`);
      continue;
    }
    const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
    const entries = text
      .split(/\r?\n/)
      .map((line, index) => parseRequirementLine(line, index + 1, file))
      .filter(Boolean);
    requirements.push({
      file,
      dependencyCount: entries.length,
      requirements: entries,
    });
  }
  return requirements;
}

function buildFileHashes(manifestFiles, issues) {
  const files = [...new Set([...hashFiles, ...manifestFiles])].sort();
  const hashes = [];
  for (const file of files) {
    if (!fs.existsSync(path.join(repoRoot, file))) {
      issues.push(`${file} is missing and cannot be hashed.`);
      continue;
    }
    hashes.push({
      file,
      sha256: sha256File(file),
    });
  }
  return hashes;
}

function summarize(nodeDependencies, pythonRequirements) {
  const externalNodeDependencies = nodeDependencies.filter((dependency) => !dependency.workspace);
  const uniqueDirectNodeNames = new Set(externalNodeDependencies.map((dependency) => dependency.name));
  const licenses = [
    ...new Set(
      externalNodeDependencies
        .map((dependency) => dependency.license)
        .filter(Boolean),
    ),
  ].sort();
  const pythonDependencyCount = pythonRequirements.reduce(
    (count, file) => count + file.dependencyCount,
    0,
  );
  return {
    workspaceManifestCount: packageJsonPaths().length,
    directNodeDependencyCount: uniqueDirectNodeNames.size,
    directNodeDependencyEdges: nodeDependencies.length,
    directExternalNodeDependencyEdges: externalNodeDependencies.length,
    pythonRequirementCount: pythonDependencyCount,
    licenseFamilies: licenses,
  };
}

const issues = [];
const manifestFiles = packageJsonPaths();
const nodeInventory = buildNodeInventory(manifestFiles, issues);
const pythonRequirements = buildPythonInventory(issues);
const fileHashes = buildFileHashes(manifestFiles, issues);
const inventory = {
  schemaVersion: 1,
  generatedAt: null,
  generation: {
    timestampIncluded: false,
    note: "Timestamp omitted so identical dependency state produces stable inventory JSON.",
  },
  repository: {
    root: path.basename(repoRoot),
    packageManager: "pnpm",
  },
  summary: summarize(nodeInventory.dependencies, pythonRequirements),
  node: nodeInventory,
  python: {
    requirements: pythonRequirements,
  },
  hashes: fileHashes,
};

if (issues.length > 0) {
  console.error("Supply-chain inventory check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

const serialized = `${JSON.stringify(inventory, null, 2)}\n`;
if (outputFile) {
  const resolvedOutput = path.resolve(repoRoot, outputFile);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, serialized);
}
if (jsonOutput) {
  process.stdout.write(serialized);
} else {
  console.log(
    `Supply-chain inventory check passed: ${inventory.summary.workspaceManifestCount} workspace manifests, ${inventory.summary.directNodeDependencyCount} direct external Node dependencies, ${inventory.summary.pythonRequirementCount} Python requirement entries, ${inventory.hashes.length} hashed files.`,
  );
  if (outputFile) {
    console.log(`Supply-chain inventory written to ${outputFile}.`);
  }
}
