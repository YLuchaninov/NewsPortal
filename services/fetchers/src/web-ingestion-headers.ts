import {
  parseSourceChannelAuthConfig,
  resolveSourceChannelAuthorizationHeader,
} from "@newsportal/contracts";

export interface WebsiteAuthContext {
  channelUrl: string;
  authConfig: unknown;
}

export function hasAuthorizationHeaderConfigured(authContext?: WebsiteAuthContext): boolean {
  return Boolean(
    authContext && parseSourceChannelAuthConfig(authContext.authConfig).authorizationHeader
  );
}

export function buildWebsiteRequestHeaders(input: {
  requestUrl: string;
  channelUrl: string | null | undefined;
  authConfig: unknown;
  headers?: HeadersInit;
}): Headers {
  const requestHeaders = new Headers(input.headers);
  const authorizationHeader = resolveSourceChannelAuthorizationHeader(
    input.requestUrl,
    input.channelUrl,
    input.authConfig
  );
  if (authorizationHeader) {
    requestHeaders.set("authorization", authorizationHeader);
  }
  return requestHeaders;
}

export function buildBrowserRouteHeaders(input: {
  requestUrl: string;
  channelUrl: string | null | undefined;
  authConfig: unknown;
  headers?: Record<string, string>;
}): Record<string, string> {
  const normalizedHeaders = buildWebsiteRequestHeaders({
    requestUrl: input.requestUrl,
    channelUrl: input.channelUrl,
    authConfig: input.authConfig,
    headers: input.headers,
  });
  const serializedHeaders: Record<string, string> = {};
  normalizedHeaders.forEach((value, key) => {
    serializedHeaders[key] = value;
  });
  return serializedHeaders;
}
