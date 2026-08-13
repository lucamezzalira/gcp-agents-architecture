import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: {
    port: 4321,
    host: true,
  },
  vite: {
    ssr: {
      external: ["postgres", "send", "fs", "path", "url", "http", "stream"],
    },
  },
});

