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
  const articleLink = `https://example.test/content/${encodeURIComponent(`editorial:${runId}`)}`;
  const articleSummary = [
    `Internal MVP acceptance article ${runId} covering an EU AI policy update.`,
    "Brussels AI guidance and Warsaw AI guidance are both included for admin-managed interest proof.",
  ].join(" ");
  const articleBody = [
    `<p>European Union regulators in Brussels and Warsaw published an EU AI policy update for internal MVP run ${runId}.</p>`,
    "<p>Brussels AI guidance focuses on policy enforcement, operator workflows, and cross-border compliance.</p>",
    "<p>Warsaw AI guidance expands the same AI policy package with matching implementation details and review checkpoints.</p>",
    "<p>This internal MVP article intentionally repeats Brussels AI guidance, Warsaw AI guidance, and EU AI policy language so historical admin-managed interests can match deterministically.</p>",
  ].join("");
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
