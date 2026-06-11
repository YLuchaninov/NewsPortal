const MUTABLE_RANGE_PREFIX_PATTERN = /^(?:\^|~|>|<|>=|<=|=|\*|latest\b)/u;
const REGISTRY_TAG_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/u;
const EXACT_SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/u;

export const forbiddenSpecPrefixes = [
  "git+",
  "git:",
  "github:",
  "http:",
  "https:",
  "file:",
];

export function validateNodeDependencySpec(name, spec) {
  const specText = String(spec).trim();

  if (specText.startsWith("workspace:")) {
    return [];
  }

  const issues = [];

  if (!specText) {
    issues.push(`${name} has an empty dependency spec.`);
    return issues;
  }

  if (forbiddenSpecPrefixes.some((prefix) => specText.startsWith(prefix))) {
    issues.push(`${name}@${specText} uses a network, git or local path dependency spec.`);
  }

  if (
    MUTABLE_RANGE_PREFIX_PATTERN.test(specText) ||
    specText.includes(" - ") ||
    /[|xX*]/u.test(specText)
  ) {
    issues.push(`${name}@${specText} is mutable; use an exact version.`);
  }

  if (
    issues.length === 0 &&
    !EXACT_SEMVER_PATTERN.test(specText) &&
    REGISTRY_TAG_PATTERN.test(specText)
  ) {
    issues.push(`${name}@${specText} is a registry tag; use an exact version.`);
  }

  if (issues.length === 0 && !EXACT_SEMVER_PATTERN.test(specText)) {
    issues.push(`${name}@${specText} must be an exact semver version.`);
  }

  return issues;
}
