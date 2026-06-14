/* global console, process */

import { rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readOption(argv, name) {
  const prefix = `--${name}=`;
  const value = argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

const root = readOption(process.argv.slice(2), "root");
const out = readOption(process.argv.slice(2), "out");

if (!root || !out) {
  throw new Error("Expected --root=<runtime package root> and --out=<build output root>.");
}

const runtimeNodeModules = path.join(repoRoot, root, "node_modules");
const outputNodeModules = path.join(repoRoot, out, "node_modules");
const relativeTarget = path.relative(path.dirname(outputNodeModules), runtimeNodeModules);

await rm(outputNodeModules, { recursive: true, force: true });
await symlink(relativeTarget, outputNodeModules, "dir");

console.log(`${out}/node_modules -> ${relativeTarget}`);
