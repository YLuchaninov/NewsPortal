/* global console, process */

import { rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const services = {
  relay: {
    root: "runtime/node/services/relay",
    entries: {
      "main.mjs": "src/main.ts",
      "cli/migrate.mjs": "src/cli/migrate.ts",
    },
    external: ["bullmq", "fastify", "ioredis", "pg"],
  },
  fetchers: {
    root: "runtime/node/services/fetchers",
    entries: {
      "main.mjs": "src/main.ts",
      "cli/signal-candidate-yield-diagnostics.mjs": "src/cli/signal-candidate-yield-diagnostics.ts",
      "cli/signal-candidate-yield-remediate.mjs": "src/cli/signal-candidate-yield-remediate.ts",
      "cli/replay-website-projections.mjs": "src/cli/replay-website-projections.ts",
      "cli/run-once.mjs": "src/cli/run-once.ts",
    },
    external: [
      "@extractus/article-extractor",
      "@extractus/oembed-extractor",
      "duck-duck-scrape",
      "fast-xml-parser",
      "fastify",
      "feedsmith",
      "htmlparser2",
      "imapflow",
      "pdfjs-dist",
      "pg",
      "playwright",
    ],
  },
  mcp: {
    root: "runtime/node/services/mcp",
    entries: {
      "main.mjs": "src/main.ts",
    },
    external: ["fastify", "pg"],
  },
};

function parseRequestedServices(argv) {
  const selected = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--service") {
      selected.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--service=")) {
      selected.push(arg.slice("--service=".length));
    }
  }

  if (selected.length === 0) {
    return Object.keys(services);
  }

  for (const service of selected) {
    if (!services[service]) {
      throw new Error(
        `Unknown service "${service}". Expected one of: ${Object.keys(services).join(", ")}.`
      );
    }
  }

  return selected;
}

function externalPatterns(names) {
  return [...new Set(names)].flatMap((name) => [name, `${name}/*`]);
}

async function buildService(name) {
  const service = services[name];
  const serviceRoot = path.join(repoRoot, service.root);
  const outdir = path.join(repoRoot, "build/node/services", name);

  await rm(outdir, { recursive: true, force: true });

  for (const [outfile, entry] of Object.entries(service.entries)) {
    await build({
      absWorkingDir: serviceRoot,
      bundle: true,
      entryPoints: [entry],
      external: externalPatterns(service.external),
      format: "esm",
      legalComments: "none",
      logLevel: "silent",
      outfile: path.join(outdir, outfile),
      platform: "node",
      sourcemap: false,
      target: "node22",
    });
  }

  const dependencyLink = path.join(outdir, "node_modules");
  const dependencyTarget = path.relative(outdir, path.join(serviceRoot, "node_modules"));
  await symlink(dependencyTarget, dependencyLink, "dir");

  console.log(
    `Built ${name}: ${Object.keys(service.entries)
      .map((entry) => path.posix.join("build/node/services", name, entry))
      .join(", ")}`
  );
}

for (const service of parseRequestedServices(process.argv.slice(2))) {
  await buildService(service);
}
