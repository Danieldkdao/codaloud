import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/services/local-workspace/execute", () => ({ executeWorkspace: mocks.execute, LocalWorkspaceError: class extends Error { constructor(readonly code: string, message: string) { super(message); } } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001", CryptoDigestAlgorithm: { SHA256: "SHA256" }, digestStringAsync: async (_: string, value: string) => createHash("sha256").update(value).digest("hex") }));
import { searchLocalFiles } from "../local/file-search";
const input = { path: "", search: "é", scope: "all" as const, pageSize: 1 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockImplementation(async (_id, operation, args) => operation === "list-files" ? [
    { name: "É.ts", path: "É.ts", isDir: false, size: 2 },
    { name: "b.ts", path: "b.ts", isDir: false, size: 2 },
    { name: "node_modules", path: "node_modules", isDir: true, size: 0 },
  ] : { path: args.path, content: "Éé", size: 4 });
});
it("paginates an immutable Unicode search snapshot and excludes dependency folders", async () => {
  const first = await searchLocalFiles("p", input);
  expect(first.totalCount).toBe(2);
  expect(first.files[0]).toMatchObject({ contentMatchCount: 2 });
  const calls = mocks.execute.mock.calls.length;
  const next = await searchLocalFiles("p", { ...input, cursor: first.nextCursor! });
  expect(next.files).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(mocks.execute).toHaveBeenCalledTimes(calls);
  expect(mocks.execute.mock.calls.some((call) => call[2].path === "node_modules")).toBe(false);
});
it("refuses a continuation for a different project or search", async () => {
  const first = await searchLocalFiles("p", input);
  await expect(searchLocalFiles("other", { ...input, cursor: first.nextCursor! })).rejects.toMatchObject({ code: "SEARCH_EXPIRED" });
  await expect(searchLocalFiles("p", { ...input, search: "different", cursor: first.nextCursor! })).rejects.toMatchObject({ code: "SEARCH_EXPIRED" });
});
