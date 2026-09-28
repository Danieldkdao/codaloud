import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // A cold wasm boot (Pyodide, ShellCheck, Prism) is seconds long, and running
    // the whole suite in parallel stretches them past the 5s default.
    testTimeout: 30_000,
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
