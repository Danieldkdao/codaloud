import { beforeEach, expect, it, vi } from "vitest";
import { readLocalFilePaths } from "../local/file-paths";

const execute = vi.hoisted(() => vi.fn());
vi.mock("@/services/local-workspace/execute", () => ({ executeWorkspace: execute }));
vi.mock("../constants", async (importOriginal) => ({
  ...await importOriginal<typeof import("../constants")>(),
  projectFileSearchLimits: { maxEntries: 5, scanTimeoutMs: 8000 },
}));
beforeEach(() => { execute.mockReset(); });

it("lists nested local paths without reading file contents or requiring Git", async () => {
  execute.mockImplementation(async (_project, _operation, { path }) => path === "" ? [
    { path: "src", name: "src", isDir: true, size: 0 },
    { path: ".env.example", name: ".env.example", isDir: false, size: 10 },
  ] : [{ path: "src/Hello.ts", name: "Hello.ts", isDir: false, size: 12 }]);
  expect(await readLocalFilePaths("project-one")).toEqual([".env.example", "src/Hello.ts"]);
  expect(execute.mock.calls).toEqual([
    ["project-one", "list-files", { path: "" }],
    ["project-one", "list-files", { path: "src" }],
  ]);
});

it("reports folder failures instead of returning an incomplete index", async () => {
  execute.mockRejectedValue(new Error("Folder unavailable"));
  await expect(readLocalFilePaths("project-one")).rejects.toThrow("Folder unavailable");
});

it("supports React Native's abort signal without throwIfAborted", async () => {
  execute.mockResolvedValue([]);
  expect(await readLocalFilePaths("project-one", { aborted: false } as AbortSignal)).toEqual([]);
});

it("stops walking after cancellation", async () => {
  const controller = new AbortController();
  execute.mockImplementation(async () => {
    controller.abort();
    return [{ path: "src", name: "src", isDir: true, size: 0 }];
  });
  await expect(readLocalFilePaths("project-one", controller.signal)).rejects.toThrow();
  expect(execute).toHaveBeenCalledOnce();
});

it("bounds indexing work and reports oversized projects", async () => {
  execute.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({
    path: `${index}.ts`, name: `${index}.ts`, isDir: false, size: 0,
  })));
  await expect(readLocalFilePaths("project-one")).rejects.toThrow("too many entries");
});
