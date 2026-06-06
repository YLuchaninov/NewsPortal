import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps", "packages", "services", "infra/scripts", "tests", "package.json"];
const ALLOWED_PATH_PARTS = [
  "docs/mcp_test/",
  "docs/product/data-scripts/",
  "docs/product/operator/examples/",
  "docs/product/operator/old_examples/",
  "docs/product/operator/scenario-packs/",
];
const BLOCKED_PATTERNS = [
  /\boutsourcing\b/iu,
  /\boutsource\b/iu,
  /\boutsourcing-rescue\b/iu,
  /\bmcp-outsourcing-verification\b/iu,
  /\bexample_c_outsourcing\b/iu,
];
const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isAllowed(relativePath) {
  const normalized = normalizePath(relativePath);
  if (normalized === "infra/scripts/check-domain-neutrality.mjs") {
    return true;
  }
  return ALLOWED_PATH_PARTS.some((part) => normalized.startsWith(part));
}

async function collectFiles(entry, files = []) {
  const absolute = path.resolve(ROOT, entry);
  const stat = await readdir(absolute, { withFileTypes: true }).catch(async () => null);
  if (stat === null) {
    files.push(entry);
    return files;
  }
  for (const dirent of stat) {
    if (dirent.name === "node_modules" || dirent.name === "dist" || dirent.name === ".astro") {
      continue;
    }
    const child = path.join(entry, dirent.name);
    if (dirent.isDirectory()) {
      await collectFiles(child, files);
    } else {
      files.push(child);
    }
  }
  return files;
}

const files = [];
for (const root of SCAN_ROOTS) {
  await collectFiles(root, files);
}

const violations = [];
for (const relativePath of files) {
  if (isAllowed(relativePath)) {
    continue;
  }
  const extension = path.extname(relativePath);
  if (extension && !TEXT_EXTENSIONS.has(extension)) {
    continue;
  }
  const text = await readFile(path.resolve(ROOT, relativePath), "utf8").catch(() => "");
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({ path: normalizePath(relativePath), pattern: String(pattern) });
    }
  }
}

if (violations.length > 0) {
  console.error("Domain-neutrality guard failed. Move domain tuning into admin/MCP config, scenario packs, or historical docs.");
  for (const violation of violations) {
    console.error(`- ${violation.path}: ${violation.pattern}`);
  }
  process.exitCode = 1;
} else {
  console.log("Domain-neutrality guard passed.");
}
