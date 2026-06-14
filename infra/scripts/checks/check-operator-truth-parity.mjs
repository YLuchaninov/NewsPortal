import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const issues = [];

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function existingFiles(files) {
  return files.filter((file) => fs.existsSync(path.join(repoRoot, file)));
}

function readJoined(files) {
  return files.map((file) => `\n--- ${file} ---\n${read(file)}`).join("\n");
}

function collectMarkdownFiles(dir) {
  const root = path.join(repoRoot, dir);
  if (!fs.existsSync(root)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(relative));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relative);
    }
  }
  return files;
}

const surfaces = {
  mcp: existingFiles([
    "runtime/node/services/mcp/src/context.ts",
    "runtime/node/services/mcp/src/resources.ts",
    "runtime/node/services/mcp/src/prompts.ts",
  ]),
  product: [
    ...collectMarkdownFiles("docs/product/architecture"),
    ...collectMarkdownFiles("docs/product/operator"),
  ],
  aidp: [
    "AGENTS.md",
    ".aidp/AGENTS.md",
    ".aidp/blueprint.md",
    ".aidp/engineering.md",
    ".aidp/verification.md",
    ...collectMarkdownFiles(".aidp/contracts"),
  ].filter((file) => file !== ".aidp/work.md" && file !== ".aidp/history.md"),
};

const surfaceText = Object.fromEntries(
  Object.entries(surfaces).map(([name, files]) => [name, readJoined(files)])
);

const invariants = [
  {
    label: "PostgreSQL business truth and derived transport state",
    required: [/PostgreSQL/i, /business truth|business state|source of truth|бизнес-истин|истин/u, /Redis|BullMQ|queues|очеред/u, /derived|transport|пересобираем/u],
  },
  {
    label: "sequence-managed events route through q.sequence",
    required: [/q\.sequence/u, /sequence-managed|Sequence Runner|sequence runtime|sequence-based|sequence-managed события/iu, /only|mandatory|только|един/iu],
  },
  {
    label: "MCP read-first/read-back/report verification",
    required: [/read[- ]?first|read-back|read-after-write|read.*write|write.*read/iu, /operator\.report\.verify/u],
  },
  {
    label: "audience-specific truth layers stay aligned",
    required: [/MCP.*operator truth|MCP resources are operator truth|MCP.*control-plane/isu, /product docs|developer\/operator documentation truth|документ/u, /\.aidp|agent-runtime truth|agent runtime|runtime truth/u],
  },
  {
    label: "final_selection_results owns final selection",
    required: [/final_selection_results/u, /primary|truth|основн|истин/u],
  },
  {
    label: "Discovery vNext is operator-facing discovery truth",
    required: [/Discovery vNext/u, /operator-facing discovery truth|operator model|оператор/u],
  },
  {
    label: "domain-specific tuning is config, not runtime hardcode",
    required: [/domain-specific|domain vocabulary|домен/u, /runtime defaults|runtime hardcode|configuration|config|operator\/admin|MCP\/admin/iu],
  },
  {
    label: "web_resources remain first-class resource truth",
    required: [/web_resources/u, /first-class|resource truth|resource-level|не должны тихо|silently/u],
  },
];

for (const [surfaceName, text] of Object.entries(surfaceText)) {
  for (const invariant of invariants) {
    for (const pattern of invariant.required) {
      if (!pattern.test(text)) {
        issues.push(`${surfaceName} surface is missing "${invariant.label}" evidence for ${pattern}.`);
      }
    }
  }
}

const forbiddenRuntimeFlags = [
  "RELAY_ENABLE_EMBED_FANOUT",
  "RELAY_ENABLE_SEQUENCE_ROUTING",
  "WORKER_ENABLE_LEGACY_QUEUE_CONSUMERS",
];

const forbiddenSearchRoots = [
  ".env.example",
  "README.md",
  "docs/product",
  "infra/docker",
  "runtime",
  ".aidp/contracts",
  ".aidp/blueprint.md",
  ".aidp/engineering.md",
  ".aidp/verification.md",
];

function collectFilesForForbiddenScan(root) {
  const fullPath = path.join(repoRoot, root);
  if (!fs.existsSync(fullPath)) {
    return [];
  }
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return [root];
  }
  const files = [];
  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".astro" || entry.name === "__pycache__") {
      continue;
    }
    const relative = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesForForbiddenScan(relative));
    } else if (entry.isFile() && /\.(?:md|ts|tsx|js|mjs|py|ya?ml|json|example)$/u.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

for (const file of forbiddenSearchRoots.flatMap(collectFilesForForbiddenScan)) {
  const text = read(file);
  for (const flag of forbiddenRuntimeFlags) {
    if (text.includes(flag)) {
      issues.push(`${file} still references removed runtime flag ${flag}.`);
    }
  }
  if (/fallback fanout/iu.test(text)) {
    issues.push(`${file} still describes fallback fanout in runtime/operator truth.`);
  }
}

if (issues.length > 0) {
  console.error("Operator truth parity check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `Operator truth parity check passed: ${invariants.length} invariants across MCP, product docs and AIDP surfaces.`
);
