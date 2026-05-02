import { execFileSync } from "node:child_process";

const defaultImage = process.env.PYTHON_RUNTIME_IMAGE ?? "newsportal-python-stage15-proof";
const imageName = process.argv[2] ?? defaultImage;
const maxBytes = Number.parseInt(
  process.env.PYTHON_RUNTIME_IMAGE_MAX_BYTES ?? "2500000000",
  10,
);

function formatBytes(bytes) {
  const gib = bytes / 1024 / 1024 / 1024;
  const mib = bytes / 1024 / 1024;
  return gib >= 1 ? `${gib.toFixed(2)} GiB` : `${mib.toFixed(0)} MiB`;
}

if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
  console.error("PYTHON_RUNTIME_IMAGE_MAX_BYTES must be a positive integer.");
  process.exit(1);
}

let sizeText;
try {
  sizeText = execFileSync(
    "docker",
    ["image", "inspect", imageName, "--format", "{{.Size}}"],
    { encoding: "utf8" },
  ).trim();
} catch (error) {
  const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
  const detail = stderr ? ` Docker said: ${stderr}` : "";
  console.error(
    `Python runtime image size check failed: could not inspect image "${imageName}".${detail}`,
  );
  process.exit(1);
}

const sizeBytes = Number.parseInt(sizeText, 10);
if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
  console.error(`Python runtime image size check failed: Docker returned invalid size "${sizeText}".`);
  process.exit(1);
}

if (sizeBytes > maxBytes) {
  console.error(
    `Python runtime image size check failed: ${imageName} is ${formatBytes(sizeBytes)}, above ${formatBytes(maxBytes)}.`,
  );
  process.exit(1);
}

console.log(
  `Python runtime image size check passed: ${imageName} is ${formatBytes(sizeBytes)} (limit ${formatBytes(maxBytes)}).`,
);
