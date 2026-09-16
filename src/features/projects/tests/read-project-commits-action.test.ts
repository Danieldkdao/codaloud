import { beforeEach, expect, it, vi } from "vitest";
import { readProjectCommitsAction } from "@/features/projects/actions/git-actions";
import type { CommitSource, ProjectCommitQueryInput } from "@/features/projects/actions/commit-schemas";

const { network, session, requestHeaders } = vi.hoisted(() => ({
  network: vi.fn<typeof fetch>(), session: vi.fn(), requestHeaders: vi.fn<() => Promise<Headers>>(),
}));
vi.mock("@/lib/auth/client-helpers", () => ({ getCurrentUserClient: session }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  fetchBase: network,
  createRequestHeaders: requestHeaders,
  createSearchParams: (params: Record<string, unknown>) => new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]),
  ),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const params = { source: "local", branch: "main" } as const;
const page = {
  commits: [{ hash: "a".repeat(40), message: "Add history", author: "Ada", authorEmail: "ada@example.com",
    committedAt: "2026-09-12T12:00:00Z", parentHashes: [], isMerge: false }],
  snapshotSha: "a".repeat(40), nextCursor: null, isShallow: false,
};
const success = (data: unknown = page) => ({ error: false, message: "Project commits loaded.", data });

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "user", error: null });
  requestHeaders.mockResolvedValue(new Headers({ Cookie: "session=test" }));
  network.mockResolvedValue(Response.json(success()));
});

it.each(["local", "remote"] as const)("reads %s commits using the session and encoded GET parameters", async (source) => {
  const signal = new AbortController().signal;
  const input = { source, branch: "feature/a&b", search: " HISTORY & FIX ", author: " ADA+GIT@EXAMPLE.COM ", pageSize: 5, cursor: "opaque.signed+cursor" };
  expect(await readProjectCommitsAction(projectId, input, signal)).toEqual(page);
  const [path, options] = network.mock.calls[0];
  const url = new URL(String(path), "https://codaloud.test");
  expect(url.pathname).toBe(`/api/projects/${projectId}/commits`);
  expect(Object.fromEntries(url.searchParams)).toEqual({ source, branch: input.branch, search: "history & fix", author: "ada+git@example.com", pageSize: "5", cursor: input.cursor });
  expect(options).toEqual({ method: "GET", headers: new Headers({ Cookie: "session=test" }), credentials: "omit", signal });
  expect(session).toHaveBeenCalledOnce();
  expect(network).toHaveBeenCalledOnce();
});

it("uses default pagination and omits a null cursor", async () => {
  expect(await readProjectCommitsAction(projectId, { ...params, cursor: null })).toEqual(page);
  const url = new URL(String(network.mock.calls[0][0]), "https://codaloud.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({ source: "local", branch: "main", search: "", author: "", pageSize: "20" });
});

it.each([
  { commits: [], snapshotSha: null, nextCursor: null, isShallow: false },
  { ...page, commits: [], nextCursor: "next-scan-cursor" },
  { ...page, isShallow: true },
])("preserves valid empty, continuing search, or shallow pages: %j", async (data) => {
  network.mockResolvedValueOnce(Response.json(success(data)));
  expect(await readProjectCommitsAction(projectId, params)).toEqual(data);
});

it.each([{ userId: null, error: null }, { userId: "user", error: new Error("expired") }])("skips requests for invalid sessions: %j", async (value) => {
  session.mockResolvedValueOnce(value);
  expect(await readProjectCommitsAction(projectId, params)).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it.each([new Headers(), new Headers({ Cookie: "" })])("skips requests without a usable session cookie", async (headers) => {
  requestHeaders.mockResolvedValueOnce(headers);
  expect(await readProjectCommitsAction(projectId, params)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each([
  { source: "other", branch: "main" }, { source: "local" }, { branch: "main" },
  { ...params, branch: "main..secret" }, { ...params, pageSize: 0 }, { ...params, pageSize: 101 },
  { ...params, pageSize: 1.5 }, { ...params, search: "a".repeat(201) }, { ...params, author: "a".repeat(201) },
  { ...params, cursor: "" }, { ...params, cursor: "a".repeat(4097) },
])("rejects invalid input before creating headers: %j", async (input) => {
  expect(await readProjectCommitsAction(projectId, input as ProjectCommitQueryInput & { source: CommitSource })).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("rejects an invalid project ID", async () => {
  expect(await readProjectCommitsAction("../other", params)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each([401, 403, 404, 409, 429, 502, 503])("returns null for HTTP %i even with a valid success body", async (status) => {
  network.mockResolvedValueOnce(Response.json(success(), { status }));
  expect(await readProjectCommitsAction(projectId, params)).toBeNull();
  expect(network).toHaveBeenCalledOnce();
});

it.each([
  null, { data: page }, { ...success(), error: true }, { ...success(), message: null },
  success({ ...page, commits: [{ ...page.commits[0], hash: "invalid" }] }),
  success({ ...page, nextCursor: "" }), success({ ...page, snapshotSha: null }),
  success({ ...page, commits: [], snapshotSha: null, nextCursor: "next" }),
  success({ ...page, isShallow: undefined }),
])("returns null for malformed or inconsistent responses: %j", async (payload) => {
  network.mockResolvedValueOnce(Response.json(payload));
  expect(await readProjectCommitsAction(projectId, params)).toBeNull();
});

it("rejects oversized pages and non-advancing cursors", async () => {
  network.mockResolvedValueOnce(Response.json(success({ ...page, commits: [...page.commits, ...page.commits] })));
  expect(await readProjectCommitsAction(projectId, { ...params, pageSize: 1 })).toBeNull();
  network.mockResolvedValueOnce(Response.json(success({ ...page, nextCursor: "same-cursor" })));
  expect(await readProjectCommitsAction(projectId, { ...params, cursor: "same-cursor" })).toBeNull();
});

it("returns only parsed fields and passes continuation cursors back unchanged", async () => {
  network.mockResolvedValueOnce(Response.json(success({ ...page, extra: "ignored", nextCursor: "next-cursor" })));
  const first = await readProjectCommitsAction(projectId, params);
  expect(first).toEqual({ ...page, nextCursor: "next-cursor" });
  network.mockResolvedValueOnce(Response.json(success()));
  expect(await readProjectCommitsAction(projectId, { ...params, cursor: first?.nextCursor })).toEqual(page);
  const url = new URL(String(network.mock.calls[1][0]), "https://codaloud.test");
  expect(url.searchParams.get("cursor")).toBe("next-cursor");
});

it.each(["WORKSPACE_RESTORING", "INVALID_COMMIT_CURSOR", "HISTORY_SNAPSHOT_UNAVAILABLE"])("reports %s failure metadata while returning null", async (code) => {
  const onFailure = vi.fn();
  network.mockResolvedValueOnce(Response.json({ error: true, code, message: "Try again." }, { status: 503, headers: { "Retry-After": "3" } }));
  expect(await readProjectCommitsAction(projectId, params, undefined, onFailure)).toBeNull();
  expect(onFailure).toHaveBeenCalledExactlyOnceWith(503, "3", code);
});

it("handles non-JSON errors and network failures without retrying", async () => {
  const onFailure = vi.fn();
  network.mockResolvedValueOnce(new Response("gateway unavailable", { status: 502 }));
  expect(await readProjectCommitsAction(projectId, params, undefined, onFailure)).toBeNull();
  expect(onFailure).toHaveBeenLastCalledWith(502, null, undefined);
  network.mockRejectedValueOnce(new TypeError("offline"));
  expect(await readProjectCommitsAction(projectId, params, undefined, onFailure)).toBeNull();
  expect(onFailure).toHaveBeenLastCalledWith(0, null);
  expect(network).toHaveBeenCalledTimes(2);
});

it("returns null for invalid JSON without reporting a transient failure", async () => {
  const onFailure = vi.fn();
  network.mockResolvedValueOnce(new Response("invalid JSON"));
  expect(await readProjectCommitsAction(projectId, params, undefined, onFailure)).toBeNull();
  expect(onFailure).not.toHaveBeenCalled();
});

it("does not request or report failures for cancelled work", async () => {
  const onFailure = vi.fn();
  const controller = new AbortController();
  controller.abort();
  expect(await readProjectCommitsAction(projectId, params, controller.signal, onFailure)).toBeNull();
  expect(network).not.toHaveBeenCalled();
  network.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
  expect(await readProjectCommitsAction(projectId, params, undefined, onFailure)).toBeNull();
  expect(onFailure).not.toHaveBeenCalled();
});

it.each(["session", "headers", "callback"])("catches %s failures", async (source) => {
  const failure = new Error(source);
  if (source === "session") session.mockRejectedValueOnce(failure);
  if (source === "headers") requestHeaders.mockRejectedValueOnce(failure);
  if (source === "callback") network.mockResolvedValueOnce(new Response("error", { status: 502 }));
  expect(await readProjectCommitsAction(projectId, params, undefined, () => { throw failure; })).toBeNull();
});

vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
