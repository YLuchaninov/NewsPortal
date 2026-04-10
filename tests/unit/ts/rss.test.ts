import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeUrl,
  collapseWhitespace,
  decodeHtmlEntities,
  stripHtmlTags
} from "../../../services/fetchers/src/rss.ts";
import { parseFeed } from "../../../services/fetchers/src/feed-parser.ts";

test("parseFeed normalizes RSS channel metadata and items", () => {
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

  const parsed = parseFeed({ body: xml, contentType: "application/rss+xml" });

  assert.equal(parsed.format, "rss2");
  assert.equal(parsed.title, "News & Updates");
  assert.equal(parsed.language, "en-US");
  assert.equal(parsed.entries.length, 1);

  const [item] = parsed.entries;
  assert.equal(item.guid, "guid-1");
  assert.equal(item.title, "EU AI Policy Update");
  assert.equal(item.url, "https://example.com/Story?a=1&b=2");
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

test("parseFeed falls back for missing title and invalid date", () => {
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

  const parsed = parseFeed({ body: xml, contentType: "application/rss+xml" });

  assert.equal(parsed.title, null);
  assert.equal(parsed.language, null);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.title, "Untitled feed item");
  assert.equal(parsed.entries[0]?.contentHtml, "plain body");
  assert.equal(parsed.entries[0]?.publishedAt, null);
  assert.equal(parsed.entries[0]?.url, "https://example.com/untitled");
});

test("parseFeed supports Atom and JSON Feed extras", () => {
  const atom = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom feed</title>
      <subtitle>Atom subtitle</subtitle>
      <updated>2026-03-22T09:00:00Z</updated>
      <entry>
        <id>tag:example.com,2026:1</id>
        <title>Atom item</title>
        <link href="https://example.com/atom-item?utm_source=atom" />
        <summary type="html">&lt;p&gt;Atom summary&lt;/p&gt;</summary>
        <content type="html">&lt;div&gt;Atom body&lt;/div&gt;</content>
        <updated>2026-03-22T09:30:00Z</updated>
        <category term="world" />
      </entry>
    </feed>`;

  const jsonFeed = JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: "JSON Feed",
    home_page_url: "https://example.com",
    feed_url: "https://example.com/feed.json",
    description: "JSON description",
    items: [
      {
        id: "json-1",
        url: "https://example.com/json-1?utm_campaign=json",
        title: "JSON item",
        summary: "<p>JSON summary</p>",
        content_html: "<p>JSON body</p>",
        date_published: "2026-03-23T10:00:00Z",
        tags: ["politics", "eu"],
        attachments: [
          {
            url: "https://cdn.example.com/image.jpg",
            mime_type: "image/jpeg",
            size_in_bytes: 42
          }
        ]
      }
    ]
  });

  const parsedAtom = parseFeed({ body: atom, contentType: "application/atom+xml" });
  const parsedJson = parseFeed({ body: jsonFeed, contentType: "application/feed+json" });

  assert.equal(parsedAtom.format, "atom");
  assert.equal(parsedAtom.entries[0]?.url, "https://example.com/atom-item");
  assert.deepEqual(parsedAtom.entries[0]?.categories, ["world"]);
  assert.equal(parsedAtom.entries[0]?.summaryHtml, "<p>Atom summary</p>");

  assert.equal(parsedJson.format, "jsonfeed");
  assert.equal(parsedJson.entries[0]?.url, "https://example.com/json-1");
  assert.deepEqual(parsedJson.entries[0]?.categories, ["politics", "eu"]);
  assert.deepEqual(parsedJson.entries[0]?.enclosure, {
    url: "https://cdn.example.com/image.jpg",
    type: "image/jpeg",
    length: 42,
  });
});

test("parseFeed rejects invalid non-feed payloads", () => {
  assert.throws(
    () => parseFeed({ body: "<html>not rss</html>", contentType: "text/html" }),
    /Invalid feed payload|well-formed/
  );
});
