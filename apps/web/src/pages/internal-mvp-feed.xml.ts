import type { APIRoute } from "astro";

export const prerender = false;

function normalizeRunId(value: string | null): string {
  const candidate = String(value ?? "").trim();
  return candidate || "default";
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const runId = normalizeRunId(url.searchParams.get("run"));
  const signalCandidateTitle = `EU AI policy update reaches Brussels and Warsaw ${runId}`;
  const signalCandidateGuid = `internal-mvp-${runId}`;
  const signalCandidateLink = `https://example.test/content/${encodeURIComponent(`signal_candidate:${runId}`)}`;
  const signalCandidateSummary = [
    `Internal MVP acceptance signal_candidate ${runId} covering an EU AI policy update.`,
    "Brussels AI guidance and Warsaw AI guidance are both included for admin-managed interest proof.",
  ].join(" ");
  const signalCandidateBody = [
    `<p>European Union regulators in Brussels and Warsaw published an EU AI policy update for internal MVP run ${runId}.</p>`,
    "<p>Brussels AI guidance focuses on policy enforcement, operator workflows, and cross-border compliance.</p>",
    "<p>Warsaw AI guidance expands the same AI policy package with matching implementation details and review checkpoints.</p>",
    "<p>This internal MVP signal_candidate intentionally repeats Brussels AI guidance, Warsaw AI guidance, and EU AI policy language so historical admin-managed interests can match deterministically.</p>",
  ].join("");
  const pubDate = new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>SignalOps Internal MVP Feed</title>
    <link>https://signalops.local/internal-mvp</link>
    <description>Internal MVP acceptance feed</description>
    <language>en</language>
    <item>
      <guid>${signalCandidateGuid}</guid>
      <title>${signalCandidateTitle}</title>
      <link>${signalCandidateLink}</link>
      <description><![CDATA[${signalCandidateSummary}]]></description>
      <content:encoded><![CDATA[${signalCandidateBody}]]></content:encoded>
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
