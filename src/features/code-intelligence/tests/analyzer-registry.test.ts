import { describe, expect, it, vi } from "vitest";
import { createCodeAnalyzerRegistry } from "../analyzer-registry";

const createPythonAnalyzer = () => ({
  analyze: vi.fn(async () => ({
    status: "ready" as const,
    diagnostics: [],
  })),
  dispose: vi.fn(),
});

describe("createCodeAnalyzerRegistry", () => {
  it("routes TypeScript and JavaScript through the existing project analyzer", async () => {
    const request = vi.fn(async () => ({ diagnostics: [] }));
    const registry = createCodeAnalyzerRegistry("src/main.js", request);
    expect(registry.debounceMs).toBe(150);

    await expect(
      registry.analyzeFile({
        path: "src/main.js",
        content: "const value = 1",
        revision: 4,
      }),
    ).resolves.toEqual({ status: "ready", revision: 4, diagnostics: [] });
    expect(request).toHaveBeenCalledWith({
      path: "src/main.js",
      content: "const value = 1",
    });
    registry.dispose();
  });

  it("loads Python analysis lazily and disposes it with the editor", async () => {
    const pythonAnalyzer = createPythonAnalyzer();
    const loadPythonAnalyzer = vi.fn(async () => pythonAnalyzer);
    const registry = createCodeAnalyzerRegistry(
      "src/main.py",
      vi.fn(),
      loadPythonAnalyzer,
    );

    // Python parses with tree-sitter first, so it no longer waits on a CPython
    // boot and settles at the default debounce.
    expect(registry.debounceMs).toBe(250);
    expect(loadPythonAnalyzer).not.toHaveBeenCalled();
    await registry.analyzeFile({
      path: "src/main.py",
      content: "print(1)",
      revision: 2,
    });
    expect(loadPythonAnalyzer).toHaveBeenCalledWith(
      "python",
      expect.objectContaining({
        loadWasmBytes: expect.any(Function),
        resolveAssetLocation: expect.any(Function),
      }),
    );
    expect(pythonAnalyzer.analyze).toHaveBeenCalledWith("print(1)");
    registry.dispose();
    expect(pythonAnalyzer.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    ["main.py", 250],
    ["main.rb", 250],
    ["deploy.sh", 400],
    ["main.go", 250],
    ["Main.java", 250],
  ])("debounces %s to %i ms", (path, debounceMs) => {
    const registry = createCodeAnalyzerRegistry(
      path,
      vi.fn(),
      vi.fn(async () => createPythonAnalyzer()),
    );

    expect(registry.debounceMs).toBe(debounceMs);
    registry.dispose();
  });

  it.each([
    ["Main.java", "java"],
    ["main.c", "c"],
    ["main.cpp", "cpp"],
    ["Main.cs", "csharp"],
    ["main.go", "go"],
    ["index.php", "php"],
    ["main.rs", "rust"],
    ["main.rb", "ruby"],
  ] as const)("lazily selects the %s grammar", async (path, grammarId) => {
    const localAnalyzer = createPythonAnalyzer();
    const loadLocalAnalyzer = vi.fn(async () => localAnalyzer);
    const registry = createCodeAnalyzerRegistry(
      path,
      vi.fn(),
      loadLocalAnalyzer,
    );

    await registry.analyzeFile({ path, content: "valid", revision: 3 });
    // The loader also receives the host's asset resolvers, so a worker can find
    // the vendored runtimes the app reaches through Metro.
    expect(loadLocalAnalyzer).toHaveBeenCalledWith(
      grammarId,
      expect.objectContaining({
        loadWasmBytes: expect.any(Function),
        resolveAssetLocation: expect.any(Function),
      }),
    );
    expect(localAnalyzer.analyze).toHaveBeenCalledWith("valid");
    registry.dispose();
  });

  it.each([
    ["README.md", "markdown"],
    ["settings.json", "json"],
    ["settings.jsonc", "jsonc"],
    ["settings.json5", "json5"],
    ["settings.yaml", "yaml"],
    ["settings.toml", "toml"],
    ["settings.xml", "xml"],
    ["settings.ini", "ini"],
    [".env", "env"],
    ["Dockerfile", "dockerfile"],
    ["scripts/run.sh", "shell"],
  ] as const)("selects the %s format analyzer", async (path, fileType) => {
    const localAnalyzer = createPythonAnalyzer();
    const loadAnalyzer = vi.fn(async () => localAnalyzer);
    const request = vi.fn();
    const registry = createCodeAnalyzerRegistry(path, request, loadAnalyzer);

    await expect(
      registry.analyzeFile({ path, content: "passive input", revision: 8 }),
    ).resolves.toMatchObject({ status: "ready", revision: 8 });
    // The loader also receives the host's asset resolvers, so a worker can find
    // the vendored runtimes the app reaches through Metro.
    expect(loadAnalyzer).toHaveBeenCalledWith(
      fileType,
      expect.objectContaining({
        loadWasmBytes: expect.any(Function),
        resolveAssetLocation: expect.any(Function),
      }),
    );
    expect(request).not.toHaveBeenCalled();
    registry.dispose();
  });

  it("keeps unsupported files out of every analyzer", async () => {
    const request = vi.fn();
    const loadPythonAnalyzer = vi.fn();
    const registry = createCodeAnalyzerRegistry(
      "src/data.unknown",
      request,
      loadPythonAnalyzer,
    );

    await expect(
      registry.analyzeFile({
        path: "src/data.unknown",
        content: "x",
        revision: 1,
      }),
    ).resolves.toEqual({ status: "unsupported", revision: 1, diagnostics: [] });
    expect(request).not.toHaveBeenCalled();
    expect(loadPythonAnalyzer).not.toHaveBeenCalled();
  });
});
