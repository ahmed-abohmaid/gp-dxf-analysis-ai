import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "./src") };
const setupFiles = ["./tests/setup.ts"];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles,
    projects: [
      {
        test: {
          name: "client",
          environment: "jsdom",
          include: ["tests/client/**/*.test.{ts,tsx}"],
        },
        resolve: { alias },
      },
      {
        test: {
          name: "server",
          environment: "node",
          include: ["tests/server/**/*.test.ts"],
        },
        resolve: { alias },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/features/**/*.{ts,tsx}",
        "src/server/**/*.ts",
      ],
      exclude: ["**/*.test.*", "**/*.d.ts"],
    },
  },
  resolve: { alias },
});
