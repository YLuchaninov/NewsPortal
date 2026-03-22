import type { APIRoute } from "astro";

export const prerender = false;

function normalizeRunId(value: string | null): string {
  const candidate = String(value ?? "").trim();
  return candidate || "default";
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const runId = normalizeRunId(url.searchParams.get("run"));
  const articleTitle = `EU AI policy update reaches Brussels and Warsaw ${runId}`;
  const articleGuid = `internal-mvp-${runId}`;
  const articleLink = `https://example.test/articles/${runId}`;
  const articleSummary = `Internal MVP acceptance article ${runId} about EU AI policy updates in Brussels and Warsaw.`;
  const articleBody = `European Union regulators in Brussels and Warsaw published updated AI policy guidance for internal MVP run ${runId}.`;
  const pubDate = new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>NewsPortal Internal MVP Feed</title>
    <link>https://newsportal.local/internal-mvp</link>
    <description>Internal MVP acceptance feed</description>
    <language>en</language>
    <item>
      <guid>${articleGuid}</guid>
      <title>${articleTitle}</title>
      <link>${articleLink}</link>
      <description><![CDATA[${articleSummary}]]></description>
      <content:encoded><![CDATA[${articleBody}]]></content:encoded>
      <pubDate>${pubDate}</pubDate>
    </item>
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};
