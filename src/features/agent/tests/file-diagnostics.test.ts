import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { collectFileDiagnostics } from "../lib/file-diagnostics";

const mocks = vi.hoisted(() => ({ analyze: vi.fn() }));
vi.mock("@/features/projects/actions/code-intelligence-actions", () => ({
  readProjectCodeIntelligence: mocks.analyze,
}));
beforeEach(() => {
  mocks.analyze.mockReset();
});
afterEach(() => vi.useRealTimers());

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
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toMatchObject({ status: "unavailable" });
  expect(vi.getTimerCount()).toBe(0);
});
