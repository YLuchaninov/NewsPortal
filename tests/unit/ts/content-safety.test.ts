import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeHtmlFragment } from "../../../packages/content-safety/src/index.ts";

test("sanitizeHtmlFragment removes active content and unsafe handlers", () => {
  const sanitized = sanitizeHtmlFragment(`
    <ScRiPt>alert(1)</ScRiPt>
    <style>body{display:none}</style>
    <p onclick="alert(1)">Safe <strong>prose</strong></p>
    <svg><animate onbegin="alert(1)" /></svg>
    <math><mtext>hidden</mtext></math>
  `);

  assert.equal(sanitized?.includes("<script"), false);
  assert.equal(sanitized?.includes("<style"), false);
  assert.equal(sanitized?.includes("onclick"), false);
  assert.equal(sanitized?.includes("<svg"), false);
  assert.equal(sanitized?.includes("<math"), false);
  assert.match(sanitized ?? "", /<p>Safe <strong>prose<\/strong><\/p>/);
});

test("sanitizeHtmlFragment allows prose but rewrites links and images safely", () => {
  const sanitized = sanitizeHtmlFragment(
    `
      <h2>Title</h2>
      <a href="/story" onclick="alert(1)">Story</a>
      <a href="javascript:alert(1)">Bad</a>
      <img src="/image.jpg" onerror="alert(1)" alt="Hero">
      <img src="//cdn.example.com/protocol-relative.jpg" alt="drop">
      <img src="data:image/svg+xml,boom" alt="drop">
    `,
    { baseUrl: "https://example.com/news/feed.xml" },
  );

  assert.match(sanitized ?? "", /<h2>Title<\/h2>/);
  assert.match(
    sanitized ?? "",
    /<a href="https:\/\/example.com\/story" rel="nofollow noopener noreferrer" target="_blank">Story<\/a>/,
  );
  assert.match(sanitized ?? "", /<a rel="nofollow noopener noreferrer" target="_blank">Bad<\/a>/);
  assert.match(sanitized ?? "", /<img src="https:\/\/example.com\/image.jpg" alt="Hero" loading="lazy" \/>/);
  assert.equal(sanitized?.includes("protocol-relative"), false);
  assert.equal(sanitized?.includes("data:image"), false);
  assert.equal(sanitized?.includes("onerror"), false);
});

test("sanitizeHtmlFragment drops relative URLs when no base URL is available", () => {
  const sanitized = sanitizeHtmlFragment('<a href="/story">Story</a><img src="/image.jpg" alt="Hero">');

  assert.match(sanitized ?? "", /<a rel="nofollow noopener noreferrer" target="_blank">Story<\/a>/);
  assert.equal(sanitized?.includes("<img"), false);
});

test("sanitizeHtmlFragment handles malformed and obfuscated URL attacks", () => {
  const sanitized = sanitizeHtmlFragment(
    `
      <p><em>Broken <strong>nesting</p>
      <a href=" java\nscript:alert(1)" style="color:red">Bad link</a>
      <a href="mailto:editor@example.com">Mail</a>
      <img src="https://example.com/hero.jpg" srcset="javascript:alert(1) 1x" style="width:expression(alert(1))">
      <img src=" /relative.jpg " alt="Relative">
    `,
    { baseUrl: "https://example.com/base/" },
  );

  assert.equal(sanitized?.includes("javascript"), false);
  assert.equal(sanitized?.includes("srcset"), false);
  assert.equal(sanitized?.includes("style="), false);
  assert.match(sanitized ?? "", /<a rel="nofollow noopener noreferrer" target="_blank">Bad link<\/a>/);
  assert.match(
    sanitized ?? "",
    /<a href="mailto:editor@example.com" rel="nofollow noopener noreferrer" target="_blank">Mail<\/a>/,
  );
  assert.match(sanitized ?? "", /<img src="https:\/\/example.com\/hero.jpg" loading="lazy" \/>/);
  assert.match(sanitized ?? "", /<img src="https:\/\/example.com\/relative.jpg" alt="Relative" loading="lazy" \/>/);
});
