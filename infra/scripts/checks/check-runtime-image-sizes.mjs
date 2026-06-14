import { execFileSync } from "node:child_process";

const gib = 1024 * 1024 * 1024;
const mib = 1024 * 1024;

const runtimeImages = [
  {
    image: "docker-web",
    service: "web",
    maxBytes: 1.2 * gib,
    expectedUser: "node",
    expectedCmd: ["node", "build/node/apps/web/server/entry.mjs"],
  },
  {
    image: "docker-admin",
    service: "admin",
    maxBytes: 1.2 * gib,
    expectedUser: "node",
    expectedCmd: ["node", "build/node/apps/admin/server/entry.mjs"],
  },
  {
    image: "docker-relay",
    service: "relay",
    maxBytes: 350 * mib,
    expectedUser: "node",
    expectedCmd: ["node", "build/node/services/relay/main.mjs"],
  },
  {
    image: "docker-migrate",
    service: "migrate",
    maxBytes: 350 * mib,
    expectedUser: "node",
    expectedCmd: ["node", "build/node/services/relay/main.mjs"],
  },
  {
    image: "docker-fetchers",
    service: "fetchers",
    maxBytes: 3 * gib,
    expectedUser: "node",
    expectedCmd: ["node", "build/node/services/fetchers/main.mjs"],
    note: "Includes Playwright/Chromium for browser-assisted ingestion.",
  },
  {
    image: "docker-mcp",
    service: "mcp",
    maxBytes: 350 * mib,
    expectedUser: "node",
    expectedCmd: ["node", "build/node/services/mcp/main.mjs"],
  },
  {
    image: "docker-api",
    service: "api",
    maxBytes: 700 * mib,
    expectedUser: "signalops",
    expectedCmd: ["python", "-m", "signalops.workers.main"],
  },
  {
    image: "docker-worker",
    service: "worker",
    maxBytes: 700 * mib,
    expectedUser: "signalops",
    expectedCmd: ["python", "-m", "signalops.workers.main"],
  },
];

function formatBytes(bytes) {
  if (bytes >= gib) {
    return `${(bytes / gib).toFixed(2)} GiB`;
  }
  return `${Math.round(bytes / mib)} MiB`;
}

function inspectImage(image) {
  try {
    const output = execFileSync("docker", ["image", "inspect", image], {
      encoding: "utf8",
    });
    const [metadata] = JSON.parse(output);
    if (!metadata || typeof metadata !== "object") {
      throw new Error("empty inspect payload");
    }
    return metadata;
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const detail = stderr ? ` Docker said: ${stderr}` : "";
    throw new Error(`could not inspect image "${image}".${detail}`, { cause: error });
  }
}

function sameCommand(actual, expected) {
  return JSON.stringify(actual ?? []) === JSON.stringify(expected);
}

const issues = [];
const inventory = [];

for (const config of runtimeImages) {
  let metadata;
  try {
    metadata = inspectImage(config.image);
  } catch (error) {
    issues.push(`${config.service}: ${error.message}`);
    continue;
  }

  const size = Number(metadata.Size);
  const user = metadata.Config?.User ?? "";
  const cmd = metadata.Config?.Cmd ?? [];
  const id = String(metadata.Id ?? "").replace(/^sha256:/, "").slice(0, 12);

  inventory.push({
    service: config.service,
    image: config.image,
    id,
    size,
    maxBytes: config.maxBytes,
    user,
    cmd,
    note: config.note,
  });

  if (!Number.isFinite(size) || size <= 0) {
    issues.push(`${config.service}: image "${config.image}" has invalid size "${metadata.Size}".`);
  } else if (size > config.maxBytes) {
    issues.push(
      `${config.service}: image "${config.image}" is ${formatBytes(size)}, above ${formatBytes(config.maxBytes)}.`,
    );
  }

  if (user !== config.expectedUser) {
    issues.push(
      `${config.service}: image "${config.image}" runs as "${user || "root/default"}", expected "${config.expectedUser}".`,
    );
  }

  if (!sameCommand(cmd, config.expectedCmd)) {
    issues.push(
      `${config.service}: image "${config.image}" CMD is ${JSON.stringify(cmd)}, expected ${JSON.stringify(config.expectedCmd)}.`,
    );
  }

  const firstCommand = String(cmd[0] ?? "");
  if (["pnpm", "npm", "npx", "tsx"].includes(firstCommand)) {
    issues.push(`${config.service}: image "${config.image}" must not start through ${firstCommand}.`);
  }
}

if (issues.length > 0) {
  console.error("Runtime image size check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Runtime image size check passed:");
for (const item of inventory) {
  const note = item.note ? ` ${item.note}` : "";
  console.log(
    `- ${item.service}: ${item.image}@${item.id} ${formatBytes(item.size)} / ${formatBytes(item.maxBytes)}, user=${item.user}, cmd=${JSON.stringify(item.cmd)}.${note}`,
  );
}
