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
  defaultPage: number
): string {
  const target = new URL(url);
  if (nextPage <= defaultPage) {
    target.searchParams.delete("page");
  } else {
    target.searchParams.set("page", String(nextPage));
  }
  return `${target.pathname}${target.search}`;
}

export function createPageHrefResolver(
  url: URL,
  defaultPage: number
): (nextPage: number) => string {
  return (nextPage: number) => resolvePageHref(url, nextPage, defaultPage);
}
