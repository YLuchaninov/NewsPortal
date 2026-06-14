import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const envExamplePath = path.join(repoRoot, ".env.example");
const envDevPath = path.join(repoRoot, ".env.dev");
const issues = [];

function parseEnvKeys(filePath) {
  if (!fs.existsSync(filePath)) {
    issues.push(`${path.basename(filePath)} is missing.`);
    return [];
  }

  const keys = [];
  const seen = new Set();
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      issues.push(`${path.basename(filePath)}:${index + 1} is not KEY=value syntax.`);
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      issues.push(`${path.basename(filePath)}:${index + 1} has invalid env key "${key}".`);
      continue;
    }
    if (seen.has(key)) {
      issues.push(`${path.basename(filePath)}:${index + 1} duplicates env key "${key}".`);
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

const exampleKeys = parseEnvKeys(envExamplePath);
const devKeys = parseEnvKeys(envDevPath);
const exampleSet = new Set(exampleKeys);
const devSet = new Set(devKeys);
const missingInDev = exampleKeys.filter((key) => !devSet.has(key));
const extraInDev = devKeys.filter((key) => !exampleSet.has(key));

if (missingInDev.length > 0) {
  issues.push(`.env.dev is missing keys from .env.example: ${missingInDev.join(", ")}.`);
}
if (extraInDev.length > 0) {
  issues.push(`.env.dev has keys not documented in .env.example: ${extraInDev.join(", ")}.`);
}

if (issues.length > 0) {
  console.error("Env sync check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Env sync check passed: .env.example and .env.dev expose ${exampleKeys.length} matching keys.`);
