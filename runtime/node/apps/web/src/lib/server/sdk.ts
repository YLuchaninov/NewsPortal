import { readRuntimeConfig } from "@signalops/config";
import { createSignalOpsSdk } from "@signalops/sdk";

function buildCookieForwardingFetch(request?: Request | null): typeof fetch {
  const cookie = request?.headers.get("cookie") ?? "";
  return ((input, init) => {
    if (!cookie) {
      return fetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookie);
    return fetch(input, {
      ...init,
      headers,
    });
  }) as typeof fetch;
}

export function createWebServerSdk(request?: Request | null) {
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4321/",
  });
  return createSignalOpsSdk({
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: buildCookieForwardingFetch(request),
  });
}
