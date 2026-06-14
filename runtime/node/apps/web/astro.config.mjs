import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

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
    process.env.SIGNALOPS_APP_BASE_URL,
    defaultAppBaseUrl,
    "http://127.0.0.1:4321/",
    "http://localhost:4321/",
    "http://127.0.0.1:8080/",
    "http://localhost:8080/"
  ].filter(Boolean);

  return Array.from(new Set(candidateUrls)).map(toAllowedDomain);
}

export default defineConfig({
  adapter: node({
    mode: "standalone"
  }),
  integrations: [react()],
  output: "server",
  outDir: path.resolve(appRoot, "../../../../build/node/apps/web"),
  cacheDir: path.resolve(appRoot, "../../../../build/cache/astro/web"),
  security: {
    checkOrigin: false,
    allowedDomains: buildAllowedDomains("http://127.0.0.1:4321/")
  },
  server: {
    host: true,
    port: 4321
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
