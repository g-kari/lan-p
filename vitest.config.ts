import { defineConfig } from "vite-plus/test/config";

// Unit tests use in-memory bindings; deployment still uses vite.config.ts.
export default defineConfig({
  test: { environment: "node" },
});
