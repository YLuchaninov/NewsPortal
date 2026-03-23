import { defineConfig } from "astro/config";
import node from "@astrojs/node";

function toAllowedDomain(urlValue) {
  const url = new URL(urlValue);
  return {
    protocol: url.protocol.replace(":", ""),
    hostname: url.hostname,
    ...(url.port ? { port: url.port } : {})
  };
}

function buildAllowedDomains(defaultAppBaseUrl) {
  const candidateUrls = [
    process.env.NEWSPORTAL_APP_BASE_URL,
    defaultAppBaseUrl,
    "http://127.0.0.1:4322/",
    "http://localhost:4322/",
    "http://127.0.0.1:8080/admin/",
    "http://localhost:8080/admin/"
  ].filter(Boolean);

  return Array.from(new Set(candidateUrls)).map(toAllowedDomain);
}

export default defineConfig({
  adapter: node({
    mode: "standalone"
  }),
  output: "server",
  security: {
    checkOrigin: false,
    allowedDomains: buildAllowedDomains("http://127.0.0.1:4322/")
  },
  server: {
    host: true,
    port: 4322
  }
});
