import * as React from "react";

import { cn } from "../../lib/utils";

interface PaginationNavProps {
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
  className?: string;
}

export function PaginationNav({
  page,
  totalPages,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
  className,
}: PaginationNavProps) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3",
        className
      )}
    >
      <a
        href={prevHref}
        className={cn(
          "inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium transition-colors",
          hasPrev ? "hover:bg-accent" : "pointer-events-none opacity-40"
        )}
        aria-disabled={hasPrev ? "false" : "true"}
      >
        Previous
      </a>
      <span className="text-sm text-muted-foreground">
        {page} / {safeTotalPages}
      </span>
      <a
        href={nextHref}
        className={cn(
          "inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium transition-colors",
          hasNext ? "hover:bg-accent" : "pointer-events-none opacity-40"
        )}
        aria-disabled={hasNext ? "false" : "true"}
      >
        Next
      </a>
    </nav>
  );
}
