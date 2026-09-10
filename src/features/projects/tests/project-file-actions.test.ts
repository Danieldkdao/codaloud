import { beforeEach, expect, it, vi } from "vitest";
import { createProjectFileAction, readProjectFilesAction } from "@/features/projects/actions/file-actions";

const mocks = vi.hoisted(() => ({ getCookie: vi.fn() }));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { getCookie: mocks.getCookie } }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("react-native", () => ({ Alert: {} }));
const projectId = "abcdef00-0000-4000-8000-000000000001";
const entry = { name: "hello.txt", path: "notes/hello.txt", isDir: false, size: 0, modifiedAt: "2026-09-10T00:00:00.000Z" };
const network = vi.fn<typeof fetch>();
beforeEach(() => {
  mocks.getCookie.mockReset().mockResolvedValue("session=mobile");
  network.mockReset().mockResolvedValue(Response.json({ error: false, message: "Files loaded.", data: [entry] }));
  vi.stubGlobal("fetch", network);
});

it("encodes the selected directory and forwards session headers and cancellation", async () => {
  const controller = new AbortController();
  expect(await readProjectFilesAction(projectId, "notes", controller.signal)).toEqual([entry]);
  const [url, options] = network.mock.calls[0];
  expect(url).toBe(`https://codaloud.test/api/projects/${projectId}/files?path=notes`);
  expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
  expect(options?.signal).toBe(controller.signal);
});

it("returns empty collections on success and null for failed or unrelated listings", async () => {
  network.mockResolvedValue(Response.json({ error: false, message: "Files loaded.", data: [] }));
  expect(await readProjectFilesAction(projectId, "")).toEqual([]);
  network.mockResolvedValue(Response.json({ error: false, message: "Files loaded.", data: [entry] }));
  expect(await readProjectFilesAction(projectId, "other")).toBeNull();
  network.mockResolvedValue(Response.json({}, { status: 503 }));
  expect(await readProjectFilesAction(projectId, "")).toBeNull();
});

it("returns a conflict to the caller without retrying or claiming creation", async () => {
  const conflict = { error: true, code: "NAME_CONFLICT", message: "Conflicting filename. Please rename this file or folder." };
  network.mockResolvedValue(Response.json(conflict, { status: 409 }));
  expect(await createProjectFileAction(projectId, { parentPath: "notes", name: "hello.txt", kind: "file" })).toEqual(conflict);
  expect(network).toHaveBeenCalledTimes(1);
});

it("validates creation inputs and matches the result to the requested entry", async () => {
  expect((await createProjectFileAction(projectId, { parentPath: "notes", name: "../escape", kind: "file" })).error).toBe(true);
  expect(network).not.toHaveBeenCalled();
  network.mockResolvedValue(Response.json({ error: false, message: "Created.", data: { ...entry, path: "other/hello.txt" } }, { status: 201 }));
  expect((await createProjectFileAction(projectId, { parentPath: "notes", name: "hello.txt", kind: "file" })).error).toBe(true);
});
