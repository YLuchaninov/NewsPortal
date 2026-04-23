import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("nginx /mcp route keeps a long-lived proxy timeout contract", () => {
  const configPath = path.join(repoRoot, "infra", "nginx", "default.conf");
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/location = \/mcp \{([\s\S]*?)\n  \}/u);

  assert.ok(match, "Expected nginx config to define a dedicated /mcp location block.");

  const block = match[1] ?? "";
  assert.match(block, /proxy_pass http:\/\/mcp:4300\/mcp;/u);
  assert.match(block, /proxy_connect_timeout 15s;/u);
  assert.match(block, /proxy_send_timeout 180s;/u);
  assert.match(block, /proxy_read_timeout 180s;/u);
  assert.match(block, /send_timeout 180s;/u);
});
