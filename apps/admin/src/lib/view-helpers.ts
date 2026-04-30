export function formatTimestamp(
  value: unknown,
  {
    emptyLabel = "—",
    includeYear = true,
  }: {
    emptyLabel?: string;
    includeYear?: boolean;
  } = {}
): string {
  if (!value) {
    return emptyLabel;
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
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
    resetParams = [],
  }: {
    pageParam?: string;
    defaultPage: number;
    resetParams?: string[];
  }
): string {
  const target = new URL(url);
  for (const paramName of resetParams) {
    target.searchParams.delete(paramName);
  }
  if (nextPage <= defaultPage) {
    target.searchParams.delete(pageParam);
  } else {
    target.searchParams.set(pageParam, String(nextPage));
  }
  return `${target.pathname}${target.search}`;
}

export function createPageHrefResolver(
  url: URL,
  options: {
    pageParam?: string;
    defaultPage: number;
    resetParams?: string[];
  }
): (nextPage: number) => string {
  return (nextPage: number) => resolvePageHref(url, nextPage, options);
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
