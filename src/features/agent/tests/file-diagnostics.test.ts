import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDiagnosticsAnalyzerOptions,
  collectFileDiagnostics,
  resolveDiagnosticsAnalyzerOptions,
  setDiagnosticsAnalyzerOptions,
} from "../lib/file-diagnostics";

const mocks = vi.hoisted(() => ({ analyze: vi.fn(), requestRemote: vi.fn() }));
vi.mock("@/features/projects/actions/code-intelligence-actions", () => ({
  readProjectCodeIntelligence: mocks.analyze,
}));
vi.mock("@/features/code-intelligence/diagnostics-actions", () => ({
  requestRemoteDiagnostics: mocks.requestRemote,
}));
beforeEach(() => {
  mocks.analyze.mockReset();
  mocks.requestRemote.mockReset();
  clearDiagnosticsAnalyzerOptions();
});
afterEach(() => vi.useRealTimers());

/**
 * The app registers no host resolvers, which is right only because the registry
 * defaults to the Metro ones. The decision is asserted directly instead.
 */
it("keeps the registry's own resolvers on the app, which registers no host", () => {
  expect(resolveDiagnosticsAnalyzerOptions()).toBeUndefined();
});

it("hands the worker's resolvers to the registry when a host registers them", () => {
  const options = {
    loadWasmBytes: vi.fn(),
    resolveAssetLocation: vi.fn(),
  };
  setDiagnosticsAnalyzerOptions(options as never);

  expect(resolveDiagnosticsAnalyzerOptions()).toBe(options);
});

it("restores the app defaults when the host registration is cleared", () => {
  setDiagnosticsAnalyzerOptions({
    loadWasmBytes: vi.fn(),
    resolveAssetLocation: vi.fn(),
  } as never);
  clearDiagnosticsAnalyzerOptions();

  expect(resolveDiagnosticsAnalyzerOptions()).toBeUndefined();
});

/**
 * Hermes has no WebAssembly, so a wasm-backed analyzer there must be reported as
 * unavailable rather than as a file with no problems.
 */
describe("on a host without WebAssembly", () => {
  beforeEach(() => {
    vi.stubGlobal("WebAssembly", undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server for a python file and maps the findings back", async () => {
    mocks.requestRemote.mockResolvedValue({
      status: "ready",
      diagnostics: [
        {
          from: 25,
          to: 26,
          severity: "error",
          message: "Unexpected syntax",
          source: "Tree-sitter: Python",
          code: "tree-sitter-python:syntax-error",
        },
      ],
    });

    const result = await collectFileDiagnostics(
      "p",
      "app.py",
      "def ok(v):\n    return v\n\nif\n  ].broken(",
    );

    expect(mocks.requestRemote).toHaveBeenCalledWith(
      {
        path: "app.py",
        content: "def ok(v):\n    return v\n\nif\n  ].broken(",
      },
      expect.any(AbortSignal),
    );
    expect(result).toMatchObject({
      status: "ready",
      engine: "tree-sitter",
      total: 1,
      items: [
        expect.objectContaining({
          code: "tree-sitter-python:syntax-error",
          line: 4,
          column: 1,
        }),
      ],
    });
  });

  it("reports unavailable rather than clean when the server cannot answer", async () => {
    mocks.requestRemote.mockResolvedValue(null);

    await expect(
      collectFileDiagnostics("p", "app.py", "x = 1"),
    ).resolves.toMatchObject({ status: "unavailable", total: null, items: [] });
  });

  // TypeScript and the format parsers are plain JavaScript, so they must keep
  // running in process and never pay for a round trip.
  it("keeps analyzing typescript and json in process", async () => {
    mocks.analyze.mockResolvedValue({ diagnostics: [] });
    mocks.requestRemote.mockResolvedValue(null);

    await collectFileDiagnostics("p", "a.ts", "const a = 1;");
    await collectFileDiagnostics("p", "settings.json", '{"a":1}');

    expect(mocks.analyze).toHaveBeenCalled();
    expect(mocks.requestRemote).not.toHaveBeenCalled();
  });
});

it("analyzes full contents and exposes real compiler errors with source positions", async () => {
  const { analyzeTypeScript } = await import("@/services/typescript/analysis");
  mocks.analyze.mockImplementation((_project, input) =>
    analyzeTypeScript(input, async () => null),
  );
  const content = '// header\nconst value: number = "wrong";';
  const result = await collectFileDiagnostics("p", "a.ts", content);
  expect(mocks.analyze).toHaveBeenCalledWith("p", { path: "a.ts", content });
  expect(result).toMatchObject({
    status: "ready",
    engine: "typescript",
    truncated: false,
  });
  expect(result.items).toContainEqual(
    expect.objectContaining({
      source: "TypeScript",
      code: "TS2322",
      severity: "error",
      line: 2,
      column: 7,
    }),
  );
});

it("distinguishes a clean file from unavailable or unsupported analysis", async () => {
  mocks.analyze.mockResolvedValueOnce({ diagnostics: [] });
  expect(await collectFileDiagnostics("p", "a.ts", "")).toMatchObject({
    status: "ready",
    total: 0,
    items: [],
  });
  mocks.analyze.mockResolvedValueOnce(null);
  expect(await collectFileDiagnostics("p", "a.ts", "")).toMatchObject({
    status: "unavailable",
  });
  mocks.analyze.mockRejectedValueOnce(new Error("Analysis failed"));
  expect(await collectFileDiagnostics("p", "a.ts", "")).toMatchObject({
    status: "unavailable",
  });
  mocks.analyze.mockClear();
  expect(
    await collectFileDiagnostics("p", "readme.txt", "hello"),
  ).toMatchObject({ status: "unsupported" });
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("includes source-accurate offline parser findings for non-TypeScript formats", async () => {
  const result = await collectFileDiagnostics(
    "p",
    "settings.json",
    '{"enabled": true,}',
  );

  expect(result).toMatchObject({
    status: "ready",
    engine: "format-parser",
    total: 1,
    items: [
      expect.objectContaining({
        source: "JSON parser",
        code: expect.stringMatching(/^json:/),
        severity: "error",
        line: 1,
      }),
    ],
  });
  expect(mocks.analyze).not.toHaveBeenCalled();
});

it("bounds escaped Unicode diagnostics without claiming the complete list was sent", async () => {
  mocks.analyze.mockResolvedValue({
    diagnostics: Array.from({ length: 100 }, (_, index) => ({
      from: 0,
      to: 1,
      severity: "error",
      source: "TypeScript",
      code: `TS${index}`,
      message: "\u0000😀".repeat(1000),
    })),
  });
  const result = await collectFileDiagnostics("p", "a.ts", "a");
  expect(result).toMatchObject({
    status: "ready",
    total: 100,
    truncated: true,
  });
  expect(result.items.length).toBeGreaterThan(0);
  expect(
    new TextEncoder().encode(JSON.stringify(result)).length,
  ).toBeLessThanOrEqual(2000);
});

it("returns unavailable when analysis stalls and clears its timer", async () => {
  vi.useFakeTimers();
  mocks.analyze.mockImplementation(() => new Promise(() => {}));
  const pending = collectFileDiagnostics("p", "a.ts", "");
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toMatchObject({ status: "unavailable" });
  expect(vi.getTimerCount()).toBe(0);
});
