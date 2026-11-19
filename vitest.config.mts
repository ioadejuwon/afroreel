import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/src/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] },
  },
});
