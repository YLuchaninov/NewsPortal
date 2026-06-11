export function containerReachableFixtureUrl(input: string): string {
  const url = new URL(input);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    url.hostname = process.env.FETCHERS_COMPOSE_HOST_GATEWAY ?? "host.docker.internal";
  }
  if (url.pathname === "/" && !url.search && !url.hash) {
    return `${url.protocol}//${url.host}`;
  }
  return url.toString();
}
