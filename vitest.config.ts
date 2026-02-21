import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    environmentMatchGlobs: [
      ["tests/client/**", "jsdom"],
      ["tests/server/**", "node"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/features/**/*.tsx",
        "src/server/**/*.ts",
      ],
      exclude: ["**/*.test.*", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
