export function formatTimestamp(value: unknown): string {
  if (!value) {
    return "—";
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function parsePositivePage(
  url: URL,
  paramName: string,
  defaultPage: number
): number {
  const requestedPage = Number.parseInt(
    url.searchParams.get(paramName) ?? String(defaultPage),
    10
  );
  return Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : defaultPage;
}

export function resolvePageHref(
  url: URL,
  nextPage: number,
  {
    pageParam = "page",
    defaultPage,
  }: {
    pageParam?: string;
    defaultPage: number;
  }
): string {
  const target = new URL(url);
  if (nextPage <= defaultPage) {
    target.searchParams.delete(pageParam);
  } else {
    target.searchParams.set(pageParam, String(nextPage));
  }
  return `${target.pathname}${target.search}`;
}

export function resolveViewHref(
  url: URL,
  view: string,
  {
    defaultView,
    resetPageParam,
  }: {
    defaultView: string;
    resetPageParam?: string;
  }
): string {
  const target = new URL(url);
  if (resetPageParam) {
    target.searchParams.delete(resetPageParam);
  }
  if (view === defaultView) {
    target.searchParams.delete("view");
  } else {
    target.searchParams.set("view", view);
  }
  return `${target.pathname}${target.search}`;
}
