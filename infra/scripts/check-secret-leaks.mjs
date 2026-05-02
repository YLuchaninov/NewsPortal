import fs from "node:fs";
import { spawnSync } from "node:child_process";

const gitResult = spawnSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
});

if (gitResult.error) {
  console.error(`Secret leak check failed to list tracked files: ${gitResult.error.message}`);
  process.exit(1);
}
if (gitResult.status !== 0) {
  console.error("Secret leak check failed to list tracked files.");
  process.exit(gitResult.status ?? 1);
}

const skippedExtensions = new Set([
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".png",
  ".webp",
]);

const patterns = [
  {
    name: "google_api_key",
    regex: new RegExp(`${"AI"}za[0-9A-Za-z_-]{35}`),
  },
  {
    name: "private_key_block",
    regex: new RegExp(`-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}`),
  },
  {
    name: "aws_access_key_id",
    regex: new RegExp(`${"AK"}IA[0-9A-Z]{16}`),
  },
  {
    name: "github_personal_access_token",
    regex: new RegExp(`${"gh"}p_[A-Za-z0-9_]{20,}`),
  },
  {
    name: "slack_token",
    regex: new RegExp(`${"xox"}[abprs]-[A-Za-z0-9-]{20,}`),
  },
];

function hasSkippedExtension(file) {
  const lowered = file.toLowerCase();
  return [...skippedExtensions].some((extension) => lowered.endsWith(extension));
}

const issues = [];
const files = gitResult.stdout.split("\0").filter(Boolean);
for (const file of files) {
  if (hasSkippedExtension(file)) {
    continue;
  }
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        issues.push(`${file}:${index + 1} matches ${pattern.name}.`);
      }
    }
  }
}

if (issues.length > 0) {
  console.error("Secret leak check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Secret leak check passed: ${files.length} tracked files scanned.`);
