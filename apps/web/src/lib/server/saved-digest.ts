import type { ContentItemDetail } from "@newsportal/contracts";
import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";
import type { Pool } from "pg";

import {
  collapseRepresentativeContentItemIds,
  resolveRepresentativeContentItemIds,
} from "./user-content-state";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseSelectedDigestItemIds(
  source: URLSearchParams | FormData | Iterable<string>
): string[] {
  const values =
    source instanceof URLSearchParams || source instanceof FormData
      ? source.getAll("item")
      : Array.from(source);

  const seen = new Set<string>();
  const itemIds: string[] = [];
  for (const rawValue of values) {
    const normalized = String(rawValue ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    itemIds.push(normalized);
  }
  return itemIds;
}

async function resolveSavedItemIds(
  pool: Pool,
  userId: string,
  itemIds: string[]
): Promise<string[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const result = await pool.query<{ content_item_id: string }>(
    `
      select content_item_id
      from user_content_state
      where user_id = $1
        and saved_state = 'saved'
        and content_item_id = any($2::text[])
    `,
    [userId, itemIds]
  );
  const allowed = new Set(result.rows.map((row) => row.content_item_id));
  const filteredItemIds = itemIds.filter((itemId) => allowed.has(itemId));
  const representativeMap = await resolveRepresentativeContentItemIds(pool, filteredItemIds);
  return collapseRepresentativeContentItemIds(filteredItemIds, representativeMap);
}

async function listAllSavedItemIds(pool: Pool, userId: string): Promise<string[]> {
  const result = await pool.query<{ content_item_id: string }>(
    `
      select content_item_id
      from user_content_state
      where user_id = $1
        and saved_state = 'saved'
      order by saved_at desc nulls last, updated_at desc, content_item_id
    `,
    [userId]
  );
  const itemIds = result.rows
    .map((row) => String(row.content_item_id ?? "").trim())
    .filter(Boolean);
  const representativeMap = await resolveRepresentativeContentItemIds(pool, itemIds);
  return collapseRepresentativeContentItemIds(itemIds, representativeMap);
}

export async function resolveSavedDigestItemIds(
  pool: Pool,
  userId: string,
  requestedItemIds: string[]
): Promise<string[]> {
  if (requestedItemIds.length === 0) {
    return listAllSavedItemIds(pool, userId);
  }
  return resolveSavedItemIds(pool, userId, requestedItemIds);
}

function createContentItemLoader() {
  const sdk = createNewsPortalSdk({
    baseUrl: readRuntimeConfig(process.env, {
      defaultAppBaseUrl: "http://127.0.0.1:4321/",
    }).apiBaseUrl,
    fetchImpl: fetch,
  });

  return (contentItemId: string) => sdk.getContentItem<ContentItemDetail>(contentItemId);
}

export async function loadSavedDigestSelection(
  pool: Pool,
  userId: string,
  requestedItemIds: string[]
): Promise<{ itemIds: string[]; items: ContentItemDetail[] }> {
  const itemIds = await resolveSavedDigestItemIds(pool, userId, requestedItemIds);
  if (itemIds.length === 0) {
    return { itemIds: [], items: [] };
  }

  const loadItem = createContentItemLoader();
  const items = await Promise.all(itemIds.map((contentItemId) => loadItem(contentItemId)));
  return { itemIds, items };
}

export async function loadSavedDigestItems(
  pool: Pool,
  userId: string,
  requestedItemIds: string[]
): Promise<ContentItemDetail[]> {
  const selection = await loadSavedDigestSelection(pool, userId, requestedItemIds);
  return selection.items;
}

export function renderSavedDigestText(items: ContentItemDetail[]): string {
  const lines = [
    `Saved digest (${items.length} item${items.length === 1 ? "" : "s"})`,
    "",
    "Articles and resources you saved to review later.",
    "",
  ];

  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${String(item.title ?? "Untitled item")}`);
    if (item.source_name) {
      lines.push(`   Source: ${String(item.source_name)}`);
    }
    if (item.published_at) {
      lines.push(`   Published: ${String(item.published_at)}`);
    }
    if (item.summary ?? item.lead) {
      lines.push(`   ${String(item.summary ?? item.lead)}`);
    }
    if (item.url) {
      lines.push(`   ${String(item.url)}`);
    }
    lines.push("");
  });

  return lines.join("\n").trim();
}

export function renderSavedDigestHtml(items: ContentItemDetail[]): string {
  const renderedItems = items
    .map((item) => {
      const title = escapeHtml(String(item.title ?? "Untitled item"));
      const summary = escapeHtml(String(item.summary ?? item.lead ?? ""));
      const sourceName = escapeHtml(String(item.source_name ?? ""));
      const publishedAt = escapeHtml(String(item.published_at ?? ""));
      const url = String(item.url ?? "").trim();
      const urlHtml = url ? escapeHtml(url) : "";

      return `
        <article class="digest-item">
          <h2>${urlHtml ? `<a href="${urlHtml}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</h2>
          ${
            sourceName || publishedAt
              ? `<p class="meta">${[sourceName, publishedAt].filter(Boolean).join(" · ")}</p>`
              : ""
          }
          ${summary ? `<p>${summary}</p>` : ""}
          ${urlHtml ? `<p><a href="${urlHtml}" target="_blank" rel="noopener noreferrer">${urlHtml}</a></p>` : ""}
        </article>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Saved digest</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe3;
        --paper: #fffdfa;
        --text: #18211c;
        --muted: #5f665f;
        --accent: #0f5d4f;
        --border: #dad4c6;
      }
      body {
        margin: 0;
        background: radial-gradient(circle at top, #fff8ea, var(--bg));
        color: var(--text);
        font-family: Georgia, "Times New Roman", serif;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 36px 20px 56px;
      }
      header {
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 2rem;
        line-height: 1.05;
      }
      .intro {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .digest-item {
        margin-top: 18px;
        padding: 18px 20px;
        background: var(--paper);
        border: 1px solid var(--border);
        border-radius: 18px;
      }
      .digest-item h2 {
        margin: 0 0 8px;
        font-size: 1.2rem;
      }
      .digest-item p {
        margin: 8px 0 0;
        line-height: 1.6;
      }
      .meta {
        color: var(--muted);
        font-size: 0.95rem;
      }
      a {
        color: var(--accent);
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Saved digest</h1>
        <p class="intro">Articles and resources you saved to review later.</p>
      </header>
      ${renderedItems}
    </main>
  </body>
</html>`;
}

export async function queueManualSavedDigest(
  pool: Pool,
  userId: string,
  items: ContentItemDetail[]
): Promise<{ digestDeliveryId: string; recipientEmail: string }> {
  const recipientResult = await pool.query<{ recipient_email: string | null }>(
    `
      select unc.config_json ->> 'email' as recipient_email
      from user_notification_channels unc
      where unc.user_id = $1
        and unc.channel_type = 'email_digest'
        and unc.is_enabled = true
      order by unc.created_at desc
      limit 1
    `,
    [userId]
  );
  const recipientEmail = String(recipientResult.rows[0]?.recipient_email ?? "").trim();
  if (!recipientEmail) {
    throw new Error("Connect an email digest channel before sending a saved digest.");
  }

  const subject = `Saved digest (${items.length} item${items.length === 1 ? "" : "s"})`;
  const bodyText = renderSavedDigestText(items);
  const bodyHtml = renderSavedDigestHtml(items);
  const logResult = await pool.query<{ digest_delivery_id: string }>(
    `
      insert into digest_delivery_log (
        user_id,
        digest_kind,
        cadence,
        status,
        recipient_email,
        subject,
        body_text,
        body_html,
        metadata_json
      )
      values ($1, 'manual_saved', null, 'queued', $2, $3, $4, $5, $6::jsonb)
      returning digest_delivery_id::text as digest_delivery_id
    `,
    [
      userId,
      recipientEmail,
      subject,
      bodyText,
      bodyHtml,
      JSON.stringify({
        itemCount: items.length,
      }),
    ]
  );
  const digestDeliveryId = logResult.rows[0]?.digest_delivery_id;
  if (!digestDeliveryId) {
    throw new Error("Failed to queue the saved digest.");
  }

  for (const [index, item] of items.entries()) {
    await pool.query(
      `
        insert into digest_delivery_items (
          digest_delivery_id,
          item_position,
          content_item_id
        )
        values ($1::uuid, $2, $3)
      `,
      [digestDeliveryId, index, item.content_item_id]
    );
  }

  return {
    digestDeliveryId,
    recipientEmail,
  };
}
