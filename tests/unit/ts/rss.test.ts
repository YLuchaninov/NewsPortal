import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeUrl,
  collapseWhitespace,
  decodeHtmlEntities,
  parseRssFeed,
  stripHtmlTags
} from "../../../services/fetchers/src/rss.ts";

test("parseRssFeed normalizes channel metadata and items", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <title><![CDATA[News &amp; Updates]]></title>
        <language>en-US</language>
        <item>
          <guid>guid-1</guid>
          <title><![CDATA[EU AI Policy Update]]></title>
          <link>HTTPS://Example.com/Story/?utm_source=rss&amp;b=2&amp;a=1#fragment</link>
          <description><![CDATA[Lead &amp; summary]]></description>
          <content:encoded><![CDATA[<p>Body &amp; details</p>]]></content:encoded>
          <pubDate>Thu, 21 Mar 2026 10:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  const parsed = parseRssFeed(xml);

  assert.equal(parsed.title, "News & Updates");
  assert.equal(parsed.language, "en-US");
  assert.equal(parsed.items.length, 1);

  const [item] = parsed.items;
  assert.equal(item.guid, "guid-1");
  assert.equal(item.title, "EU AI Policy Update");
  assert.equal(item.url, "HTTPS://Example.com/Story/?utm_source=rss&b=2&a=1#fragment");
  assert.equal(item.summaryHtml, "Lead & summary");
  assert.equal(item.contentHtml, "<p>Body & details</p>");
  assert.equal(item.publishedAt, "2026-03-21T10:00:00.000Z");
  assert.match(item.rawXmlHash, /^[a-f0-9]{64}$/);
});

test("canonicalizeUrl strips trackers and normalizes casing", () => {
  const canonical = canonicalizeUrl(
    "HTTPS://Example.com/Story/?utm_source=rss&b=2&a=1&fbclid=ignored#fragment"
  );

  assert.equal(canonical, "https://example.com/Story?a=1&b=2");
});

test("RSS helpers decode entities and strip markup deterministically", () => {
  assert.equal(decodeHtmlEntities("Tom &amp; Jerry &#33; &#x3F; &unknown;"), "Tom & Jerry ! ? &unknown;");
  assert.equal(stripHtmlTags("<style>a{}</style><script>x()</script><p>Hello <strong>world</strong></p>"), "   Hello  world  ");
  assert.equal(collapseWhitespace("  many \n spaced\twords  "), "many spaced words");
});

test("parseRssFeed falls back for missing title and invalid date", () => {
  const xml = `<?xml version="1.0"?>
    <rss>
      <channel>
        <item>
          <link>https://example.com/untitled/?gclid=drop-me</link>
          <content><![CDATA[plain body]]></content>
          <updated>not-a-date</updated>
        </item>
      </channel>
    </rss>`;

  const parsed = parseRssFeed(xml);

  assert.equal(parsed.title, null);
  assert.equal(parsed.language, null);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0]?.title, "Untitled RSS item");
  assert.equal(parsed.items[0]?.contentHtml, "plain body");
  assert.equal(parsed.items[0]?.publishedAt, null);
  assert.equal(parsed.items[0]?.url, "https://example.com/untitled/?gclid=drop-me");
});

test("parseRssFeed rejects invalid non-RSS payloads", () => {
  assert.throws(() => parseRssFeed("<html>not rss</html>"), /Invalid RSS feed/);
});
