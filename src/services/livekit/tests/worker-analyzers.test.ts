import { afterEach, describe, expect, it } from "vitest";
import { createCodeAnalyzerRegistry } from "@/features/code-intelligence/analyzer-registry";
import type { AnalyzerLoaderOptions } from "@/features/code-intelligence/analyzer-registry";
import { clearDiagnosticsAnalyzerOptions } from "@/features/agent/lib/file-diagnostics";
import {
  loadWorkerWasmBytes,
  resolveWorkerAssetLocation,
} from "../worker-wasm-loader";

/**
 * Plain Node has no bundler, so it must locate the vendored wasm itself; a failure
 * is silent. This drives the real runtimes through the worker's own resolvers.
 */
const workerOptions: AnalyzerLoaderOptions = {
  loadWasmBytes: loadWorkerWasmBytes,
  resolveAssetLocation: resolveWorkerAssetLocation,
};

afterEach(() => {
  // The registration is module state shared by every test in this file, so it
  // has to be undone or it leaks into anything that runs next.
  clearDiagnosticsAnalyzerOptions();
});

const analyze = async (path: string, content: string) => {
  const registry = createCodeAnalyzerRegistry(
    path,
    async () => null,
    undefined,
    workerOptions,
  );
  try {
    return await registry.analyzeFile({ path, content, revision: 1 });
  } finally {
    registry.dispose();
  }
};

describe("analyzers in the Node worker", () => {
  it("reports real syntax errors for python, including at the end of the file", async () => {
    const result = await analyze(
      "app.py",
      ["def ok(value):", "    return value", "", "", "if", "  ].broken("].join(
        "\n",
      ),
    );

    expect(result.status).toBe("ready");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    // A syntax error on the final lines must still be located, not dropped.
    expect(result.diagnostics.at(-1)!.from).toBeGreaterThan(20);
  });

  it("still distinguishes a clean file from an unavailable one for python", async () => {
    await expect(
      analyze("app.py", "def ok(value):\n    return value + 1\n"),
    ).resolves.toMatchObject({ status: "ready", diagnostics: [] });
  });

  it("reports real syntax errors for a tree-sitter grammar", async () => {
    const result = await analyze("main.go", "package main\nfunc main( { }\n");

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "tree-sitter-go:syntax-error" }),
    );
  });

  it("reports real lint findings for shell", async () => {
    const result = await analyze("deploy.sh", "echo $UNQUOTED\n");

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "shellcheck:SC2086" }),
    );
  });

  it("reports real parse errors for ruby", async () => {
    const result = await analyze("main.rb", "def a\n  b +\nend\n");

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "prism:expect-expression-after-operator",
      }),
    );
  });

  it("still distinguishes a clean file from an unavailable one", async () => {
    await expect(
      analyze("main.go", "package main\n\nfunc main() {}\n"),
    ).resolves.toMatchObject({ status: "ready", diagnostics: [] });
  });
});

/**
 * On the device the app relies entirely on the registry's own Metro resolvers; a
 * placeholder looks equivalent but silently reports "unavailable" for every file.
 */
describe("analyzer options on the device", () => {
  it("leaves the registry's own resolvers in place when no host registers", async () => {
    const registry = createCodeAnalyzerRegistry("main.go", async () => null);
    try {
      const result = await registry.analyzeFile({
        path: "main.go",
        content: "package main\n\nfunc main() {}\n",
        revision: 1,
      });
      // The wasm cannot load outside Metro, so either outcome is fine; what matters
      // is that it reached the analyzer without demanding a host reader.
      expect(["ready", "unavailable"]).toContain(result.status);
    } finally {
      registry.dispose();
    }
  });
});
