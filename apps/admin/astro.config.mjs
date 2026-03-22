import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  adapter: node({
    mode: "standalone"
  }),
  output: "server",
  security: {
    checkOrigin: false
  },
  server: {
    host: true,
    port: 4322
  }
});
