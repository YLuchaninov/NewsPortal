import assert from "node:assert/strict";
import test from "node:test";

import {
  validateNodeDependencySpec
} from "../../../infra/scripts/lib/dependency-specs.mjs";

test("dependency spec validator allows exact versions and workspace references", () => {
  assert.deepEqual(validateNodeDependencySpec("react", "19.2.4"), []);
  assert.deepEqual(validateNodeDependencySpec("@signalops/contracts", "workspace:*"), []);
});

test("dependency spec validator rejects mutable ranges, tags and source-moving specs", () => {
  for (const spec of ["^1.2.3", "~1.2.3", ">=1.2.3", "1.x", "*", "latest", "next"]) {
    assert.match(
      validateNodeDependencySpec("mutable-package", spec).join("\n"),
      /exact version|registry tag|mutable/
    );
  }

  for (const spec of [
    "git+https://example.test/repo.git",
    "github:owner/repo",
    "https://example.test/pkg.tgz",
    "file:../pkg.tgz"
  ]) {
    assert.match(
      validateNodeDependencySpec("source-package", spec).join("\n"),
      /network, git or local path/
    );
  }
});
