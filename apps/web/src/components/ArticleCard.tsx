import { useState } from "react";
import { ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";

interface Article {
  doc_id: string;
  title?: string;
  lead?: string;
  lang?: string;
  processing_state?: string;
  system_feed_decision?: string;
  system_feed_eligible?: boolean;
  visibility_state?: string;
  like_count?: number;
  dislike_count?: number;
  published_at?: string;
  source_name?: string;
  url?: string;
}

interface ArticleCardProps {
  article: Article;
  isLoggedIn: boolean;
  reactionsPath: string;
  contextBadgeLabel?: string;
  contextNote?: string | null;
}

export function resolveSafeArticleHref(url?: string): string | null {
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

export function ArticleCard({
  article,
  isLoggedIn,
  reactionsPath,
  contextBadgeLabel,
  contextNote,
}: ArticleCardProps) {
  const [likes, setLikes] = useState(Number(article.like_count ?? 0));
  const [dislikes, setDislikes] = useState(Number(article.dislike_count ?? 0));
  const [reacted, setReacted] = useState<"like" | "dislike" | null>(null);

  async function react(type: "like" | "dislike") {
    if (reacted === type) return;
    setReacted(type);
    if (type === "like") setLikes((l) => l + 1);
    else setDislikes((d) => d + 1);

    await fetch(reactionsPath, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ docId: article.doc_id, reactionType: type }),
    });
  }

  const stateMeta: Record<string, { className: string; label: string }> = {
    raw: {
      className: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
      label: "raw",
    },
    pending: {
      className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      label: "pending",
    },
    normalized: {
      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      label: "normalized",
    },
    deduped: {
      className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
      label: "deduped",
    },
    embedded: {
      className: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
      label: "embedded",
    },
    clustered: {
      className: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
      label: "clustered",
    },
    matched: {
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
      label: "matched",
    },
    notified: {
      className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
      label: "notified",
    },
    blocked: {
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      label: "blocked",
    },
  };

  const stateKey = String(article.processing_state ?? "raw");
  const state = stateMeta[stateKey] ?? {
    className: "bg-muted text-muted-foreground",
    label: stateKey,
  };
  const feedBadge = article.system_feed_eligible
    ? {
        className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        label: "system-selected",
      }
    : state;
  const sourceHref = resolveSafeArticleHref(article.url);
  const previewContent = (
    <>
      <div
        className="h-40 bg-gradient-to-br from-primary/10 via-accent to-secondary flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-4xl opacity-20 select-none font-bold">
          {String(article.title ?? "N").charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="flex flex-wrap gap-1.5">
          {article.lang && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
              {String(article.lang).toUpperCase()}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${feedBadge.className}`}>
            {feedBadge.label}
          </span>
          {contextBadgeLabel && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {contextBadgeLabel}
            </span>
          )}
          {article.visibility_state && article.visibility_state !== "visible" && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">
              {String(article.visibility_state)}
            </span>
          )}
        </div>

        <h3 className="font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {String(article.title ?? "Untitled article")}
        </h3>

        {contextNote && (
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 line-clamp-2">
            {contextNote}
          </p>
        )}

        {article.lead && (
          <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
            {String(article.lead)}
          </p>
        )}
      </div>
    </>
  );

  return (
    <article className="group flex flex-col bg-card rounded-xl border border-border overflow-hidden hover:shadow-md hover:border-primary/20 transition-all duration-200">
      {sourceHref ? (
        <a
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
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
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3">
            {isLoggedIn && (
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
            {!isLoggedIn && (
              <span className="text-xs text-muted-foreground">
                {likes > 0 && `${likes} likes`}
              </span>
            )}
          </div>
          {sourceHref ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              title="Open original article"
              aria-label="Open original article"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span
              className="text-muted-foreground/50"
              title="Original article link unavailable"
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
