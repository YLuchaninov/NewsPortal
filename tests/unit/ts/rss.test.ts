import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeUrl,
  collapseWhitespace,
  decodeHtmlEntities,
  stripHtmlTags
} from "../../../runtime/node/services/fetchers/src/rss.ts";
import { parseFeed } from "../../../runtime/node/services/fetchers/src/feed-parser/index.ts";

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

test("parseFeed hardens generic RSS and Atom URL/date/category fallbacks", () => {
  const rss = `<?xml version="1.0"?>
    <rss
      xmlns:atom="http://www.w3.org/2005/Atom"
      xmlns:xdc="http://purl.org/dc/elements/1.1/"
      xmlns:media="http://search.yahoo.com/mrss/"
    >
      <channel>
        <title>Fallback feed</title>
        <link>https://example.com/news/</link>
        <item xml:base="https://example.com/base/">
          <guid isPermaLink="true">https://example.com/guid-story?utm_source=feed</guid>
          <title>Guid permalink</title>
          <xdc:date>2026-04-07T09:00:00Z</xdc:date>
          <xdc:subject>policy</xdc:subject>
          <category>policy</category>
          <media:keywords>ai, procurement</media:keywords>
        </item>
        <item>
          <guid>atom-link-item</guid>
          <title>Atom link item</title>
          <atom:link rel="alternate" href="relative-atom-story?utm_campaign=drop" />
        </item>
      </channel>
    </rss>`;

  const parsed = parseFeed({
    body: rss,
    contentType: "application/rss+xml",
    feedUrl: "https://example.com/feed.xml"
  });

  assert.equal(parsed.entries[0]?.url, "https://example.com/guid-story");
  assert.equal(parsed.entries[0]?.publishedAt, "2026-04-07T09:00:00.000Z");
  assert.deepEqual(parsed.entries[0]?.categories, ["policy", "ai, procurement"]);
  assert.equal(parsed.entries[1]?.url, "https://example.com/news/relative-atom-story");
  assert.ok(parsed.diagnostics?.some((diagnostic) => diagnostic.code === "guid_permalink_used"));
  assert.ok(parsed.diagnostics?.some((diagnostic) => diagnostic.code === "relative_url_resolved"));
});

test("parseFeed resolves relative links from xml:base and feedUrl", () => {
  const xmlBaseFeed = `<?xml version="1.0"?>
    <rss>
      <channel xml:base="https://example.com/xml-base/">
        <item>
          <guid>relative-xml-base</guid>
          <title>Relative XML base</title>
          <link>story-a?utm_medium=rss</link>
        </item>
      </channel>
    </rss>`;
  const feedUrlOnlyFeed = `<?xml version="1.0"?>
    <rss>
      <channel>
        <item>
          <guid>relative-feed-url</guid>
          <title>Relative feed URL</title>
          <link>story-b?utm_source=rss</link>
        </item>
      </channel>
    </rss>`;

  const xmlBaseParsed = parseFeed({
    body: xmlBaseFeed,
    contentType: "application/rss+xml",
    feedUrl: "https://feeds.example.com/root/feed.xml"
  });
  const feedUrlParsed = parseFeed({
    body: feedUrlOnlyFeed,
    contentType: "application/rss+xml",
    feedUrl: "https://feeds.example.com/root/feed.xml"
  });

  assert.equal(xmlBaseParsed.entries[0]?.url, "https://example.com/xml-base/story-a");
  assert.equal(feedUrlParsed.entries[0]?.url, "https://feeds.example.com/root/story-b");
});

test("parseFeed supports Atom enclosures and JSON Feed content_text", () => {
  const atom = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>atom-media</id>
        <title>Atom media</title>
        <link rel="alternate" href="https://example.com/atom-media" />
        <link rel="enclosure" href="/media/audio.mp3" type="audio/mpeg" length="12" />
        <updated>2026-04-08T10:00:00Z</updated>
      </entry>
    </feed>`;
  const jsonFeed = JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: "Text feed",
    items: [
      {
        id: 123,
        url: "/json-text?utm_source=json",
        title: "JSON text item",
        content_text: "Plain text body",
        date_modified: "2026-04-09T11:00:00Z"
      }
    ]
  });

  const parsedAtom = parseFeed({
    body: atom,
    contentType: "application/atom+xml",
    feedUrl: "https://example.com/feed.atom"
  });
  const parsedJson = parseFeed({
    body: jsonFeed,
    contentType: "application/feed+json",
    feedUrl: "https://example.com/feeds/feed.json"
  });

  assert.deepEqual(parsedAtom.entries[0]?.enclosure, {
    url: "https://example.com/media/audio.mp3",
    type: "audio/mpeg",
    length: 12
  });
  assert.equal(parsedJson.entries[0]?.guid, "123");
  assert.equal(parsedJson.entries[0]?.url, "https://example.com/json-text");
  assert.equal(parsedJson.entries[0]?.contentHtml, "Plain text body");
  assert.equal(parsedJson.entries[0]?.publishedAt, "2026-04-09T11:00:00.000Z");
});

test("parseFeed supports RDF feeds through the Feedsmith-backed parser path", () => {
  const rdf = `<?xml version="1.0"?>
    <rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns="http://purl.org/rss/1.0/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
    >
      <channel rdf:about="https://example.com/">
        <title>RDF feed</title>
        <link>https://example.com/</link>
      </channel>
      <item rdf:about="https://example.com/rdf-story?utm_source=rdf">
        <title>RDF story</title>
        <link>https://example.com/rdf-story?utm_source=rdf</link>
        <description>RDF summary</description>
        <dc:date>2026-04-10T12:00:00Z</dc:date>
        <dc:subject>rdf-topic</dc:subject>
      </item>
    </rdf:RDF>`;

  const parsed = parseFeed({
    body: rdf,
    contentType: "application/rdf+xml",
    feedUrl: "https://example.com/rss1.xml",
  });

  assert.equal(parsed.format, "rss1");
  assert.equal(parsed.title, "RDF feed");
  assert.equal(parsed.entries[0]?.url, "https://example.com/rdf-story");
  assert.equal(parsed.entries[0]?.summaryHtml, "RDF summary");
  assert.equal(parsed.entries[0]?.publishedAt, "2026-04-10T12:00:00.000Z");
  assert.deepEqual(parsed.entries[0]?.categories, ["rdf-topic"]);
});

test("parseFeed supports RSS 1.0 RDF feeds with namespaced item metadata", () => {
  const rdf = `<?xml version="1.0" encoding="UTF-8"?>
    <rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns="http://purl.org/rss/1.0/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:content="http://purl.org/rss/1.0/modules/content/"
    >
      <channel rdf:about="https://notices.example.test/rss.xml">
        <title>Public notices RDF</title>
        <link>https://notices.example.test/</link>
        <description>Public notice feed</description>
      </channel>
      <item rdf:about="https://notices.example.test/item/42?utm_campaign=feed">
        <title>Notice item</title>
        <link>https://notices.example.test/item/42?utm_campaign=feed</link>
        <description>Short RDF description</description>
        <content:encoded><![CDATA[<p>Full RDF item body.</p>]]></content:encoded>
        <dc:date>2026-06-05T14:01:00Z</dc:date>
      </item>
    </rdf:RDF>`;

  const parsed = parseFeed({
    body: rdf,
    contentType: "text/xml",
    feedUrl: "https://notices.example.test/rss.xml",
  });

  assert.equal(parsed.format, "rss1");
  assert.equal(parsed.title, "Public notices RDF");
  assert.equal(parsed.entries[0]?.url, "https://notices.example.test/item/42");
  assert.equal(parsed.entries[0]?.contentHtml, "<p>Full RDF item body.</p>");
  assert.equal(parsed.entries[0]?.publishedAt, "2026-06-05T14:01:00.000Z");
});

test("parseFeed rejects invalid non-feed payloads", () => {
  assert.throws(
    () => parseFeed({ body: "<html>not rss</html>", contentType: "text/html" }),
    /Invalid feed payload|well-formed/
  );
});
