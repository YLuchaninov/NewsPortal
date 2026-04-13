import assert from "node:assert/strict";
import test from "node:test";

import { formatTemplateBrowserErrorMessage } from "../../../apps/admin/src/pages/bff/admin/templates.ts";

test("formatTemplateBrowserErrorMessage points system-interest time-window schema drift to migrations", () => {
  const message = formatTemplateBrowserErrorMessage(
    new Error(
      'null value in column "time_window_hours" of relation "interest_templates" violates not-null constraint'
    ),
    "interest"
  );

  assert.equal(
    message,
    "System interest save failed because the interest form and database schema are out of sync. Apply the latest migrations or write-path fix, then retry."
  );
});

test("formatTemplateBrowserErrorMessage points missing selection_profiles relation to migrations", () => {
  const message = formatTemplateBrowserErrorMessage(
    new Error('relation "selection_profiles" does not exist'),
    "interest"
  );

  assert.equal(
    message,
    "System interest save failed because the interest form and database schema are out of sync. Apply the latest migrations or write-path fix, then retry."
  );
});

test("formatTemplateBrowserErrorMessage keeps non-schema save errors readable", () => {
  const message = formatTemplateBrowserErrorMessage(
    new Error('Template field "time_window_hours" must be a positive integer.'),
    "interest"
  );

  assert.equal(
    message,
    'Template field "time_window_hours" must be a positive integer.'
  );
});
