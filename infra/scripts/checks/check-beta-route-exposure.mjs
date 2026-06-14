import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const issues = [];

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function serviceBlocks(composeText) {
  const blocks = new Map();
  let current = null;
  let lines = [];
  for (const line of composeText.split(/\r?\n/)) {
    const match = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/);
    if (match) {
      if (current) {
        blocks.set(current, lines.join("\n"));
      }
      current = match[1];
      lines = [line];
      continue;
    }
    if (current) {
      lines.push(line);
    }
  }
  if (current) {
    blocks.set(current, lines.join("\n"));
  }
  return blocks;
}

const baseCompose = read("infra/docker/compose.yml");
for (const [service, block] of serviceBlocks(baseCompose)) {
  if (/^\s{4}ports:\s*$/m.test(block)) {
    issues.push(`infra/docker/compose.yml service "${service}" publishes host ports; host exposure belongs in dev/prod overlays.`);
  }
}

const prodCompose = read("infra/docker/compose.prod.yml");
const prodBlocks = serviceBlocks(prodCompose);
for (const [service, block] of prodBlocks) {
  if (!/^\s{4}ports:\s*$/m.test(block)) {
    continue;
  }
  if (service !== "nginx") {
    issues.push(`infra/docker/compose.prod.yml service "${service}" publishes ports; only nginx may be public in beta.`);
  }
}
const nginxProd = prodBlocks.get("nginx") ?? "";
for (const expected of [
  "../nginx/beta.conf:/etc/nginx/conf.d/default.conf:ro",
  "../../data/tls:/etc/nginx/tls:ro",
  "${NGINX_HTTP_PORT:-80}:80",
  "${NGINX_HTTPS_PORT:-443}:443",
]) {
  if (!nginxProd.includes(expected)) {
    issues.push(`infra/docker/compose.prod.yml nginx is missing "${expected}".`);
  }
}

const betaNginx = read("infra/nginx/beta.conf");
for (const required of [
  "listen 443 ssl",
  "ssl_certificate /etc/nginx/tls/fullchain.pem;",
  "Strict-Transport-Security",
  "limit_req_zone $binary_remote_addr zone=api_rate",
  "limit_req zone=bff_rate",
  "limit_req zone=mcp_rate",
  "location ^~ /api/maintenance/",
  "proxy_pass http://api:8000/;",
  "proxy_pass http://admin:4322/",
  "proxy_pass http://web:4321/",
  "proxy_pass http://mcp:4300/mcp;",
]) {
  if (!betaNginx.includes(required)) {
    issues.push(`infra/nginx/beta.conf is missing required beta route/security snippet "${required}".`);
  }
}
if (/location\s+\/relay\b|proxy_pass\s+http:\/\/relay:4000/iu.test(betaNginx)) {
  issues.push("infra/nginx/beta.conf must not expose relay.");
}
if (!/return\s+301\s+https:\/\/\$host\$request_uri;/u.test(betaNginx)) {
  issues.push("infra/nginx/beta.conf must redirect HTTP to HTTPS.");
}

if (issues.length > 0) {
  console.error("Beta route exposure check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Beta route exposure check passed: only nginx is public and beta nginx is hardened.");
