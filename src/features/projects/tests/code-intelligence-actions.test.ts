import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProject: vi.fn(),
  execute: vi.fn(),
  createAnalyzer: vi.fn(),
  analyzeOnce: vi.fn(),
}));
vi.mock("../local/access", () => ({ requireLocalProject: mocks.requireProject }));
vi.mock("@/services/local-workspace/execute", () => ({ executeWorkspace: mocks.execute }));
vi.mock("@/services/typescript/analysis", () => ({
  createTypeScriptAnalyzer: mocks.createAnalyzer,
  analyzeTypeScript: mocks.analyzeOnce,
}));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.requireProject.mockImplementation(async (id: string) => ({ id }));
  mocks.createAnalyzer.mockImplementation(() => ({
    analyze: vi.fn().mockResolvedValue({ diagnostics: [] }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }));
});
const input = { path: "src/main.ts", content: "const count = 42;" };

it("reuses the active project's analyzer and releases it when changing projects", async () => {
  const { readProjectCodeIntelligence } = await import("../actions/code-intelligence-actions");
  expect(await readProjectCodeIntelligence("first", input)).toEqual({ diagnostics: [] });
  expect(await readProjectCodeIntelligence("first", { ...input, content: "const count = 43;" })).toEqual({ diagnostics: [] });
  expect(mocks.createAnalyzer).toHaveBeenCalledOnce();
  const first = mocks.createAnalyzer.mock.results[0].value;
  expect(first.analyze).toHaveBeenCalledTimes(2);
  await readProjectCodeIntelligence("second", input);
  expect(first.dispose).toHaveBeenCalledOnce();
  expect(mocks.createAnalyzer).toHaveBeenCalledTimes(2);
});

it("reads dependencies through the correct native workspace and treats missing files as absent", async () => {
  const { readProjectCodeIntelligence } = await import("../actions/code-intelligence-actions");
  await readProjectCodeIntelligence("first", input);
  const read = mocks.createAnalyzer.mock.calls[0][0];
  mocks.execute.mockResolvedValue({ path: "src/value.ts", content: "hello", size: 5 });
  expect(await read("src/value.ts")).toBe("hello");
  expect(mocks.execute).toHaveBeenCalledWith("first", "read-file", { path: "src/value.ts" });
  mocks.execute.mockRejectedValue(new Error("Missing file"));
  expect(await read("missing.ts")).toBeNull();
});

it("returns null on access or analysis failure", async () => {
  const { readProjectCodeIntelligence } = await import("../actions/code-intelligence-actions");
  mocks.requireProject.mockRejectedValueOnce(new Error("No project"));
  expect(await readProjectCodeIntelligence("first", input)).toBeNull();
  expect(mocks.createAnalyzer).not.toHaveBeenCalled();
  mocks.createAnalyzer.mockReturnValueOnce({ analyze: vi.fn().mockRejectedValue(new Error("Analysis failed")) });
  expect(await readProjectCodeIntelligence("first", input)).toBeNull();
});
