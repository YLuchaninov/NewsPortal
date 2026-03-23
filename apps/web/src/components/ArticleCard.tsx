import { useState } from "react";
import { ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";

interface Article {
  doc_id: string;
  title?: string;
  lead?: string;
  lang?: string;
  processing_state?: string;
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
  publicApiBaseUrl: string;
}

export function ArticleCard({ article, isLoggedIn, reactionsPath, publicApiBaseUrl }: ArticleCardProps) {
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

  const stateColor: Record<string, string> = {
    published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    blocked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    normalized: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };

  const stateClass = stateColor[String(article.processing_state)] ?? "bg-muted text-muted-foreground";

  return (
    <article className="group flex flex-col bg-card rounded-xl border border-border overflow-hidden hover:shadow-md hover:border-primary/20 transition-all duration-200">
      {/* Gradient thumbnail */}
      <div
        className="h-40 bg-gradient-to-br from-primary/10 via-accent to-secondary flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-4xl opacity-20 select-none font-bold">
          {String(article.title ?? "N").charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Meta badges */}
        <div className="flex flex-wrap gap-1.5">
          {article.lang && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
              {String(article.lang).toUpperCase()}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stateClass}`}>
            {String(article.processing_state ?? "raw")}
          </span>
          {article.visibility_state && article.visibility_state !== "visible" && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">
              {String(article.visibility_state)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {String(article.title ?? "Untitled article")}
        </h3>

        {/* Lead */}
        {article.lead && (
          <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
            {String(article.lead)}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
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
          <a
            href={`${publicApiBaseUrl}/articles/${article.doc_id}/explain`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            title="View explain"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

