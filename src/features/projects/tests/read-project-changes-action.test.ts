import { beforeEach, expect, it, vi } from "vitest";
import { readProjectChangesAction } from "@/features/projects/actions/git-actions";

const { network, session, requestHeaders } = vi.hoisted(() => ({
  network: vi.fn<typeof fetch>(),
  session: vi.fn(),
  requestHeaders: vi.fn<() => Promise<Headers>>(),
}));
vi.mock("@/lib/auth/client-helpers", () => ({ getCurrentUserClient: session }));
vi.mock("@/lib/utils", async () => {
  const { z } = await import("zod");
  return {
    fetchBase: network,
    createRequestHeaders: requestHeaders,
    isValidIds: (id: string) => z.uuid().safeParse(id).success,
  };
});

const projectId = "11111111-1111-4111-8111-111111111111";
const data = {
  repositoryState: "ready", currentBranch: "main", headSha: "a".repeat(40),
  isDetached: false, observedAt: "2026-09-13T12:00:00Z",
  changes: [{
    path: "new.txt", originalPath: null, indexStatus: "unchanged", worktreeStatus: "untracked",
    isUntracked: true, isConflicted: false, kind: "file",
    headMode: "000000", indexMode: "000000", worktreeMode: "100644", staged: null,
    unstaged: { patch: "+hello\n", additions: 1, deletions: 0, unavailableReason: null },
  }],
};
const success = (value: unknown = data) => ({ error: false, message: "Project changes loaded.", data: value });

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "user", error: null });
  requestHeaders.mockResolvedValue(new Headers({ Cookie: "session=test" }));
  network.mockResolvedValue(Response.json(success()));
});

it("authenticates and fetches validated changes without query parameters", async () => {
  const signal = new AbortController().signal;
  network.mockResolvedValueOnce(Response.json(success({ ...data, extra: true })));
  expect(await readProjectChangesAction(projectId, signal)).toEqual(data);
  expect(session).toHaveBeenCalledOnce();
  expect(network).toHaveBeenCalledExactlyOnceWith(`/api/projects/${projectId}/changes`, {
    method: "GET", headers: new Headers({ Cookie: "session=test" }), credentials: "omit", signal,
  });
});

it("preserves a successful empty result", async () => {
  const empty = { ...data, changes: [] };
  network.mockResolvedValueOnce(Response.json(success(empty)));
  expect(await readProjectChangesAction(projectId)).toEqual(empty);
});

it.each([{ userId: null, error: null }, { userId: "user", error: new Error("expired") }])("skips requests for invalid sessions: %j", async (value) => {
  session.mockResolvedValueOnce(value);
  expect(await readProjectChangesAction(projectId)).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it.each(["", "invalid", "../other/changes", `${projectId}?branch=other`])("rejects an invalid project ID: %s", async (id) => {
  expect(await readProjectChangesAction(id)).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it.each([new Headers(), new Headers({ Cookie: " " })])("skips requests without a usable session cookie", async (headers) => {
  requestHeaders.mockResolvedValueOnce(headers);
  expect(await readProjectChangesAction(projectId)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each([401, 404, 409, 413, 502, 503])("returns null for HTTP %s even with a success-shaped body", async (status) => {
  network.mockResolvedValueOnce(Response.json(success(), { status }));
  expect(await readProjectChangesAction(projectId)).toBeNull();
});

it.each([
  { error: true, message: "Unavailable", data },
  success({ ...data, changes: [{ path: "incomplete" }] }),
  { error: false, data },
  null,
])("returns null for invalid API payloads: %j", async (payload) => {
  network.mockResolvedValueOnce(Response.json(payload));
  expect(await readProjectChangesAction(projectId)).toBeNull();
});

it("catches session, header, network and JSON failures", async () => {
  for (const dependency of [session, requestHeaders, network]) {
    dependency.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await readProjectChangesAction(projectId)).toBeNull();
  }
  network.mockResolvedValueOnce(new Response("not JSON"));
  expect(await readProjectChangesAction(projectId)).toBeNull();
});

it("avoids cancelled requests and discards data cancelled while decoding", async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await readProjectChangesAction(projectId, controller.signal)).toBeNull();
  expect(network).not.toHaveBeenCalled();

  const pending = new AbortController();
  const response = Response.json(success());
  vi.spyOn(response, "json").mockImplementation(async () => {
    pending.abort();
    return success();
  });
  network.mockResolvedValueOnce(response);
  expect(await readProjectChangesAction(projectId, pending.signal)).toBeNull();
});
