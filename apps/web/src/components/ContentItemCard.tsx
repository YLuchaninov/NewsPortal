import { useState } from "react";
import { Clock3, ExternalLink, ThumbsDown, ThumbsUp, User2 } from "lucide-react";

import type { ContentItemPreview, UserContentStateView } from "@newsportal/contracts";
import { UserContentStateControls } from "./UserContentStateControls";

interface ContentItemCardProps {
  contentItem: ContentItemPreview;
  isLoggedIn: boolean;
  reactionsPath: string;
  contentStatePath?: string;
  contextBadgeLabel?: string;
  contextNote?: string | null;
  initialUserState?: UserContentStateView;
}

export function resolveSafeContentHref(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const resolved = new URL(url);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

export function resolveInternalContentHref(contentItemId?: string): string | null {
  const normalized = String(contentItemId ?? "").trim();
  return normalized ? `/content/${encodeURIComponent(normalized)}` : null;
}

function formatReadTime(seconds?: number | null): string | null {
  const numeric = Number(seconds ?? NaN);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const minutes = Math.max(1, Math.round(numeric / 60));
  return `${minutes} min read`;
}

export function ContentItemCard({
  contentItem,
  isLoggedIn,
  reactionsPath,
  contentStatePath,
  contextBadgeLabel,
  contextNote,
  initialUserState,
}: ContentItemCardProps) {
  const [likes, setLikes] = useState(Number(contentItem.like_count ?? 0));
  const [dislikes, setDislikes] = useState(Number(contentItem.dislike_count ?? 0));
  const [reacted, setReacted] = useState<"like" | "dislike" | null>(null);
  const [userState, setUserState] = useState<UserContentStateView | null>(
    initialUserState ?? null
  );
  const canReact =
    isLoggedIn &&
    contentItem.origin_type === "editorial" &&
    !!String(contentItem.origin_id ?? "").trim();
  const canManageState = isLoggedIn && !!contentStatePath && userState != null;

  async function react(type: "like" | "dislike") {
    if (!canReact || reacted === type) return;
    setReacted(type);
    if (type === "like") setLikes((l) => l + 1);
    else setDislikes((d) => d + 1);

    await fetch(reactionsPath, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ docId: String(contentItem.origin_id), reactionType: type }),
    });
  }

  const decisionMeta: Record<string, { className: string; label: string }> = {
    selected: {
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
      label: "system-selected",
    },
    pending_ai_review: {
      className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      label: "pending-ai-review",
    },
    filtered_out: {
      className: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
      label: "filtered-out",
    },
    kind_enabled: {
      className: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
      label: "kind-enabled",
    },
    unknown: {
      className: "bg-muted text-muted-foreground",
      label: "unknown",
    },
  };

  const decisionKey = String(contentItem.system_selection_decision ?? "unknown");
  const decision = decisionMeta[decisionKey] ?? {
    className: "bg-muted text-muted-foreground",
    label: decisionKey,
  };
  const detailHref = resolveInternalContentHref(contentItem.content_item_id);
  const sourceHref = resolveSafeContentHref(contentItem.url);
  const previewMediaUrl = String(contentItem.primary_media_url ?? "").trim() || null;
  const previewMediaKind = String(contentItem.primary_media_kind ?? "").trim() || null;
  const sourceLabel = String(contentItem.source_name ?? "").trim() || null;
  const authorLabel = String(contentItem.author_name ?? "").trim() || null;
  const readTimeLabel = formatReadTime(contentItem.read_time_seconds ?? null);
  const summary = String(contentItem.summary ?? contentItem.lead ?? "").trim() || null;
  const contentKindLabel = String(contentItem.content_kind ?? "content").trim() || "content";
  const isUnread = !!userState && !userState.is_new && !userState.is_seen;
  const previewContent = (
    <>
      {previewMediaUrl ? (
        <div className="relative h-40 overflow-hidden bg-muted" aria-hidden="true">
          <img
            src={previewMediaUrl}
            alt={String(contentItem.primary_media_alt_text ?? contentItem.title ?? "Content preview")}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
          {previewMediaKind && previewMediaKind !== "image" && (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
              {previewMediaKind}
            </span>
          )}
        </div>
      ) : (
        <div
          className="h-40 bg-gradient-to-br from-primary/10 via-accent to-secondary flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="text-4xl opacity-20 select-none font-bold">
            {String(contentItem.title ?? "C").charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="flex flex-wrap gap-1.5">
          {contentItem.lang && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
              {String(contentItem.lang).toUpperCase()}
            </span>
          )}
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary/40 text-secondary-foreground">
            {contentKindLabel}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${decision.className}`}>
            {decision.label}
          </span>
          {contextBadgeLabel && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {contextBadgeLabel}
            </span>
          )}
          {userState?.is_new && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
              new
            </span>
          )}
          {isUnread && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
              unread
            </span>
          )}
          {userState?.saved_state === "saved" && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
              saved
            </span>
          )}
          {userState?.is_following_story && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
              following
            </span>
          )}
          {userState?.story_updated_since_seen && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              updated
            </span>
          )}
        </div>

        {(sourceLabel || authorLabel || readTimeLabel) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {sourceLabel && <span className="font-medium text-foreground/80">{sourceLabel}</span>}
            {authorLabel && (
              <span className="inline-flex items-center gap-1">
                <User2 className="h-3.5 w-3.5" />
                {authorLabel}
              </span>
            )}
            {readTimeLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {readTimeLabel}
              </span>
            )}
          </div>
        )}

        <h3 className="font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {String(contentItem.title ?? "Untitled content item")}
        </h3>

        {contextNote && (
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 line-clamp-2">
            {contextNote}
          </p>
        )}

        {summary && (
          <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
            {summary}
          </p>
        )}
      </div>
    </>
  );

  return (
    <article className="group flex flex-col bg-card rounded-xl border border-border overflow-hidden hover:shadow-md hover:border-primary/20 transition-all duration-200">
      {detailHref ? (
        <a
          href={detailHref}
          className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {previewContent}
        </a>
      ) : (
        <div className="flex flex-1 flex-col">
          {previewContent}
        </div>
      )}

      <div className="px-4 pb-4">
        {canManageState && contentStatePath && userState && (
          <div className="pt-3 border-t border-border">
            <UserContentStateControls
              contentItemId={String(contentItem.content_item_id)}
              contentStatePath={contentStatePath}
              initialUserState={userState}
              onUserStateChange={setUserState}
              compact
              showArchiveButton
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-3">
          <div className="flex items-center gap-3">
            {canReact && (
              <>
                <button
                  type="button"
                  onClick={() => react("like")}
                  disabled={reacted !== null}
                  className={`flex items-center gap-1 text-sm transition-colors hover:text-primary ${
                    reacted === "like" ? "text-primary font-medium" : "text-muted-foreground"
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span>{likes}</span>
                </button>
                <button
                  type="button"
                  onClick={() => react("dislike")}
                  disabled={reacted !== null}
                  className={`flex items-center gap-1 text-sm transition-colors hover:text-destructive ${
                    reacted === "dislike" ? "text-destructive font-medium" : "text-muted-foreground"
                  }`}
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span>{dislikes}</span>
                </button>
              </>
            )}
            {!canReact && (
              <span className="text-xs text-muted-foreground">
                {sourceLabel ?? contentKindLabel}
              </span>
            )}
          </div>
          {sourceHref ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              title="Open original source"
              aria-label="Open original source"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span
              className="text-muted-foreground/50"
              title="Original source link unavailable"
              aria-hidden="true"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
