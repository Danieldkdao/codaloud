import { beforeEach, expect, it, vi } from "vitest";
import { createProjectFileAction, deleteProjectFileAction, readProjectFileContentAction, readProjectFilesAction, saveProjectFileContentAction, updateProjectFileAction } from "@/features/projects/actions/file-actions";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";

const mocks = vi.hoisted(() => ({ getCookie: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { getCookie: mocks.getCookie, getSession: mocks.getSession } }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("react-native", () => ({ Alert: {} }));
const projectId = "abcdef00-0000-4000-8000-000000000001";
const entry = { name: "hello.txt", path: "notes/hello.txt", isDir: false, size: 0, modifiedAt: "2026-09-10T00:00:00.000Z" };
const network = vi.fn<typeof fetch>();
beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ data: { user: { id: "current-user" } }, error: null });
  mocks.getCookie.mockReset().mockResolvedValue("session=mobile");
  network.mockReset().mockResolvedValue(Response.json({ error: false, message: "Files loaded.", data: [entry] }));
  vi.stubGlobal("fetch", network);
});

const updateInput = { parentPath: "notes", previousName: "old.txt", name: "hello.txt", kind: "file" as const };

const saveInput = { path: "notes/hello #?&你好.txt", content: "你好\r\n", expectedContentHash: "a".repeat(64) };
const savedFile = { path: saveInput.path, size: 8, contentHash: "b".repeat(64) };

it.each([saveInput.content, ""])("sends authenticated validated file contents and returns confirmed save data: %j", async (content) => {
  const input = { ...saveInput, content };
  const result = { error: false, message: "File saved.", data: { ...savedFile, size: new TextEncoder().encode(content).byteLength } };
  network.mockResolvedValue(Response.json(result));
  expect(await saveProjectFileContentAction(projectId, input)).toEqual(result);
  expect(mocks.getSession).toHaveBeenCalledOnce();
  expect(network).toHaveBeenCalledOnce();
  const [url, options] = network.mock.calls[0];
  expect(url).toBe(`https://codaloud.test/api/projects/${projectId}/file-content`);
  expect(options).toMatchObject({ method: "PUT", credentials: "omit" });
  expect(JSON.parse(String(options?.body))).toEqual(input);
  expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
  expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
});

it("verifies the session before validating save input or sending a request", async () => {
  mocks.getSession.mockResolvedValue({ data: null, error: null });
  expect(await saveProjectFileContentAction("invalid", saveInput)).toEqual({ error: true, message: "You must be signed in to save files." });
  mocks.getSession.mockResolvedValue({ data: { user: { id: "current-user" } }, error: { message: "private session details" } });
  expect(await saveProjectFileContentAction(projectId, saveInput)).toEqual({ error: true, message: "Unable to verify your session. Please try again." });
  expect(mocks.getCookie).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("rejects invalid save input and missing cookies without sending a request", async () => {
  expect((await saveProjectFileContentAction("invalid", saveInput)).error).toBe(true);
  for (const input of [
    { ...saveInput, path: "../outside" }, { ...saveInput, content: "\0" },
    { ...saveInput, content: "é".repeat(MAX_PROJECT_FILE_SIZE_BYTES) },
    { ...saveInput, expectedContentHash: "invalid" }, { ...saveInput, sandboxId: "other" },
  ]) {
    expect((await saveProjectFileContentAction(projectId, input)).error).toBe(true);
  }
  expect(mocks.getCookie).not.toHaveBeenCalled();
  mocks.getCookie.mockResolvedValue("");
  expect((await saveProjectFileContentAction(projectId, saveInput)).error).toBe(true);
  expect(network).not.toHaveBeenCalled();
});

it.each([[401, "UNAUTHENTICATED"], [409, "FILE_CHANGED"], [503, "WORKSPACE_RESTORING"]])("preserves save error %s %s without retrying", async (status, code) => {
  const failure = { error: true, code, message: "Save was not confirmed." };
  network.mockResolvedValue(Response.json(failure, { status: Number(status) }));
  expect(await saveProjectFileContentAction(projectId, saveInput)).toEqual(failure);
  expect(network).toHaveBeenCalledOnce();
});

it("does not confirm saves with malformed or mismatched metadata or unsuccessful HTTP status", async () => {
  for (const data of [{ ...savedFile, path: "other.txt" }, { ...savedFile, size: saveInput.content.length }, { ...savedFile, contentHash: "invalid" }, {}]) {
    network.mockResolvedValue(Response.json({ error: false, message: "File saved.", data }));
    expect((await saveProjectFileContentAction(projectId, saveInput)).error).toBe(true);
  }
  network.mockResolvedValue(Response.json({ error: false, message: "File saved.", data: savedFile }, { status: 500 }));
  expect((await saveProjectFileContentAction(projectId, saveInput)).error).toBe(true);
  network.mockResolvedValue(new Response("not JSON"));
  expect((await saveProjectFileContentAction(projectId, saveInput)).error).toBe(true);
});

it("returns safe error objects for save network and authentication failures", async () => {
  const failure = { error: true, message: "Unable to confirm the save. Please try again." };
  network.mockRejectedValue(new Error("private network details"));
  expect(await saveProjectFileContentAction(projectId, saveInput)).toEqual(failure);
  expect(network).toHaveBeenCalledOnce();
  network.mockClear();
  mocks.getCookie.mockRejectedValue(new Error("private cookie details"));
  expect(await saveProjectFileContentAction(projectId, saveInput)).toEqual(failure);
  mocks.getSession.mockRejectedValue(new Error("private session details"));
  expect(await saveProjectFileContentAction(projectId, saveInput)).toEqual(failure);
  expect(network).not.toHaveBeenCalled();
});

it("reads the selected file using encoded paths, native authentication, and cancellation", async () => {
  const data = { path: "notes/hello #?&你好.txt", content: "你好", size: 6 };
  network.mockResolvedValue(Response.json({ error: false, message: "File loaded.", data }));
  const controller = new AbortController();
  expect(await readProjectFileContentAction(projectId, data.path, controller.signal)).toEqual(data);
  const [url, options] = network.mock.calls[0];
  expect(String(url).split("?")[0]).toBe(`https://codaloud.test/api/projects/${projectId}/file-content`);
  expect(new URL(String(url)).searchParams.get("path")).toBe(data.path);
  expect(options).toMatchObject({ method: "GET", credentials: "omit", signal: controller.signal });
  expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
});

it("does not request file contents with invalid input or missing authentication", async () => {
  expect(await readProjectFileContentAction("invalid", "file.txt")).toBeNull();
  for (const path of ["", "../outside", "/etc/passwd", "a//b", "a\\b"]) {
    expect(await readProjectFileContentAction(projectId, path)).toBeNull();
  }
  mocks.getCookie.mockResolvedValue("");
  expect(await readProjectFileContentAction(projectId, "file.txt")).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it("accepts an empty file but rejects mismatched, oversized, and malformed content responses", async () => {
  const data = { path: "file.txt", content: "", size: 0 };
  network.mockResolvedValue(Response.json({ error: false, message: "File loaded.", data }));
  expect(await readProjectFileContentAction(projectId, data.path)).toEqual(data);
  for (const invalid of [{ ...data, path: "other.txt" }, { ...data, content: "é", size: 1 }, { ...data, content: "a".repeat(MAX_PROJECT_FILE_SIZE_BYTES + 1), size: MAX_PROJECT_FILE_SIZE_BYTES + 1 }, { ...data, size: -1 }, {}]) {
    network.mockResolvedValue(Response.json({ error: false, message: "File loaded.", data: invalid }));
    expect(await readProjectFileContentAction(projectId, data.path)).toBeNull();
  }
  network.mockResolvedValue(Response.json({ error: false, message: "File loaded.", data }, { status: 500 }));
  expect(await readProjectFileContentAction(projectId, data.path)).toBeNull();
});

it("reports file read errors separately while preserving the data-or-null contract", async () => {
  const onFailure = vi.fn();
  for (const [status, code] of [[413, "FILE_TOO_LARGE"], [503, "WORKSPACE_RESTORING"]] as const) {
    const failure = { error: true, code, message: "Unable to open this file." };
    network.mockResolvedValue(Response.json(failure, { status, headers: { "Retry-After": "3" } }));
    expect(await readProjectFileContentAction(projectId, "file.txt", undefined, onFailure)).toBeNull();
    expect(onFailure).toHaveBeenLastCalledWith(failure, "3");
  }
});

it("returns null for malformed JSON, network failures, cancellation, or auth lookup failures", async () => {
  network.mockResolvedValue(new Response("not JSON"));
  expect(await readProjectFileContentAction(projectId, "file.txt")).toBeNull();
  network.mockRejectedValue(new Error("offline"));
  expect(await readProjectFileContentAction(projectId, "file.txt")).toBeNull();
  network.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  expect(await readProjectFileContentAction(projectId, "file.txt")).toBeNull();
  network.mockClear();
  mocks.getCookie.mockRejectedValue(new Error("session unavailable"));
  expect(await readProjectFileContentAction(projectId, "file.txt")).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it("sends rename through the shared authenticated request helpers", async () => {
  const result = { error: false, message: "Updated.", data: entry };
  network.mockResolvedValue(Response.json(result));
  expect(await updateProjectFileAction(projectId, updateInput)).toEqual(result);
  const [url, options] = network.mock.calls[0];
  expect(url).toBe(`https://codaloud.test/api/projects/${projectId}/files`);
  expect(options).toMatchObject({ method: "PATCH", credentials: "omit" });
  expect(JSON.parse(String(options?.body))).toEqual(updateInput);
  expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
  expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
});

it("rejects invalid rename input before making a request", async () => {
  expect((await updateProjectFileAction("invalid", updateInput)).error).toBe(true);
  expect((await updateProjectFileAction(projectId, { ...updateInput, previousName: "../old.txt" })).error).toBe(true);
  expect((await updateProjectFileAction(projectId, { ...updateInput, name: "other/new.txt" })).error).toBe(true);
  expect(network).not.toHaveBeenCalled();
});

it("preserves rename errors and does not retry an ambiguous network failure", async () => {
  const conflict = { error: true, code: "NAME_CONFLICT", message: "Choose another name." };
  network.mockResolvedValue(Response.json(conflict, { status: 409 }));
  expect(await updateProjectFileAction(projectId, updateInput)).toEqual(conflict);
  network.mockRejectedValue(new Error("offline"));
  expect(await updateProjectFileAction(projectId, updateInput)).toMatchObject({ error: true, message: expect.stringContaining("Refresh") });
  expect(network).toHaveBeenCalledTimes(2);
});

it("never confirms a rename with mismatched metadata or an unsuccessful response", async () => {
  for (const data of [{ ...entry, path: "other/hello.txt" }, { ...entry, name: "other.txt" }, { ...entry, isDir: true }, {}]) {
    network.mockResolvedValue(Response.json({ error: false, message: "Updated.", data }));
    expect((await updateProjectFileAction(projectId, updateInput)).error).toBe(true);
  }
  network.mockResolvedValue(Response.json({ error: false, message: "Updated.", data: entry }, { status: 500 }));
  expect((await updateProjectFileAction(projectId, updateInput)).error).toBe(true);
  network.mockResolvedValue(new Response("not JSON"));
  expect((await updateProjectFileAction(projectId, updateInput)).error).toBe(true);
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

it("reports restoration retry metadata while preserving the null failure contract", async () => {
  const onRestoring = vi.fn();
  network.mockResolvedValue(Response.json({ error: true, code: "WORKSPACE_RESTORING" }, {
    status: 503, headers: { "Retry-After": "3" },
  }));
  expect(await readProjectFilesAction(projectId, "", undefined, onRestoring)).toBeNull();
  expect(onRestoring).toHaveBeenCalledExactlyOnceWith("3");
  onRestoring.mockClear();
  for (const status of [401, 403, 404, 503]) {
    network.mockResolvedValue(Response.json({ error: true, code: "OTHER_FAILURE" }, { status }));
    expect(await readProjectFilesAction(projectId, "", undefined, onRestoring)).toBeNull();
  }
  expect(onRestoring).not.toHaveBeenCalled();
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

const deleteInput = { parentPath: "notes", name: "hello.txt", kind: "file" as const };

it("sends an authenticated DELETE and confirms the exact deleted entry", async () => {
  const result = { error: false, message: "Deleted.", data: entry };
  network.mockResolvedValue(Response.json(result));
  expect(await deleteProjectFileAction(projectId, deleteInput)).toEqual(result);
  const [url, options] = network.mock.calls[0];
  expect(url).toBe(`https://codaloud.test/api/projects/${projectId}/files`);
  expect(options).toMatchObject({ method: "DELETE", credentials: "omit" });
  expect(JSON.parse(String(options?.body))).toEqual(deleteInput);
  expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
  expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
});

it("rejects invalid deletion targets and missing authentication before sending", async () => {
  expect((await deleteProjectFileAction("invalid", deleteInput)).error).toBe(true);
  for (const input of [{ ...deleteInput, name: ".." }, { ...deleteInput, parentPath: "../other" }]) {
    expect((await deleteProjectFileAction(projectId, input)).error).toBe(true);
  }
  mocks.getCookie.mockResolvedValue("");
  expect((await deleteProjectFileAction(projectId, deleteInput)).error).toBe(true);
  expect(network).not.toHaveBeenCalled();
});

it("preserves deletion failures without automatically retrying", async () => {
  const failure = { error: true, code: "FILE_CHANGED", message: "Refresh this folder." };
  network.mockResolvedValue(Response.json(failure, { status: 409 }));
  expect(await deleteProjectFileAction(projectId, deleteInput)).toEqual(failure);
  network.mockRejectedValue(new Error("offline"));
  expect(await deleteProjectFileAction(projectId, deleteInput)).toMatchObject({ error: true, message: expect.stringContaining("Refresh") });
  expect(network).toHaveBeenCalledTimes(2);
});

it("does not confirm deletion from malformed, mismatched, or unsuccessful responses", async () => {
  for (const data of [{ ...entry, path: "other/hello.txt" }, { ...entry, name: "other.txt" }, { ...entry, isDir: true }, {}]) {
    network.mockResolvedValue(Response.json({ error: false, message: "Deleted.", data }));
    expect((await deleteProjectFileAction(projectId, deleteInput)).error).toBe(true);
  }
  network.mockResolvedValue(Response.json({ error: false, message: "Deleted.", data: entry }, { status: 500 }));
  expect((await deleteProjectFileAction(projectId, deleteInput)).error).toBe(true);
  network.mockResolvedValue(new Response("not JSON"));
  expect((await deleteProjectFileAction(projectId, deleteInput)).error).toBe(true);
});
