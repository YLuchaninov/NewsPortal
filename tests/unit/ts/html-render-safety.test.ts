import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readWorkspaceFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf-8");
}

test("content detail pages render persisted HTML only through shared sanitizer", () => {
  const publicContent = readWorkspaceFile("apps/web/src/pages/content/[id].astro");
  const adminArticle = readWorkspaceFile("apps/admin/src/pages/articles/[docId].astro");
  const adminResource = readWorkspaceFile("apps/admin/src/pages/resources/[resourceId].astro");

  for (const source of [publicContent, adminArticle, adminResource]) {
    assert.match(source, /@newsportal\/content-safety/);
    assert.match(source, /sanitizeHtmlFragment\(/);
    assert.doesNotMatch(source, /replace\(\s*\/<script/i);
  }
});

test("admin inline SVG icon rendering is sourced from the static shell icon map", () => {
  const adminShell = readWorkspaceFile("apps/admin/src/layouts/AdminShell.astro");
  const sidebarNav = readWorkspaceFile("apps/admin/src/components/AdminDesktopSidebarNav.tsx");

  assert.match(adminShell, /const icons: Record<string, string> = \{/);
  assert.match(adminShell, /iconSvg: icons\[icon\]/);
  assert.match(sidebarNav, /dangerouslySetInnerHTML=\{\{ __html: item\.iconSvg \}\}/);
  assert.doesNotMatch(sidebarNav, /body_html|full_content_html|resourceHtml|articleHtml/);
});
