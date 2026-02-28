import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "./src") };
const setupFiles = ["./testsSetup.ts"];

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
          include: ["src/{lib,hooks,features,components}/**/__tests__/**/*.test.{ts,tsx}"],
        },
        resolve: { alias },
      },
      {
        test: {
          name: "server",
          environment: "node",
          include: ["src/server/**/__tests__/**/*.test.ts"],
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
