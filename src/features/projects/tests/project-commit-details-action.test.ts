import { beforeEach, expect, it, vi } from "vitest";

import { readProjectCommitDetailsAction } from "../actions/git-actions";
import type { ProjectCommitDetailsParamsSchema, ProjectCommitDetailsSchema } from "../actions/commit-details-schemas";

const { network, session, requestHeaders } = vi.hoisted(() => ({
  network: vi.fn<typeof fetch>(), session: vi.fn(), requestHeaders: vi.fn<() => Promise<Headers>>(),
}));
vi.mock("@/lib/auth/client-helpers", () => ({ getCurrentUserClient: session }));
vi.mock("@/lib/utils", () => ({
  fetchBase: network,
  createRequestHeaders: requestHeaders,
  createSearchParams: (params: Record<string, string>) => new URLSearchParams(params),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const params = { commitSha: "a".repeat(40), source: "local" } as const;
const details: ProjectCommitDetailsSchema = {
  source: "local",
  commit: {
    hash: params.commitSha, message: "add greeting", author: "Ada", authorEmail: "ada@example.com",
    committer: "Ada", committerEmail: "ada@example.com", authoredAt: "2026-09-15T12:00:00Z",
    committedAt: "2026-09-15T12:00:00Z", parentHashes: [], isMerge: false,
  },
  baseSha: null,
  files: [{
    path: "greeting.ts", originalPath: null, status: "added", beforeMode: "000000", afterMode: "100644",
    diff: { patch: "@@ -0,0 +1 @@\n+hello\n", additions: 1, deletions: 0, unavailableReason: null },
  }],
  summary: { fileCount: 1, additions: 1, deletions: 0, unavailableCount: 0 }, githubUrl: null,
};
const success = (data: unknown = details) => ({ error: false, message: "Commit details loaded.", data });

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "user", error: null });
  requestHeaders.mockResolvedValue(new Headers({ Cookie: "session=test" }));
  network.mockResolvedValue(Response.json(success()));
});

it.each(["local", "remote"] as const)("loads %s commit details with validated parameters and session headers", async (source) => {
  const signal = new AbortController().signal;
  const data = { ...details, source };
  network.mockResolvedValueOnce(Response.json(success({ ...data, extra: true })));
  expect(await readProjectCommitDetailsAction(projectId, { ...params, source }, signal)).toEqual(data);
  expect(network).toHaveBeenCalledExactlyOnceWith(`/api/projects/${projectId}/commit/${params.commitSha}?source=${source}`, {
    method: "GET", headers: new Headers({ Cookie: "session=test" }), credentials: "omit", signal,
  });
});

it("supports full SHA-256 hashes and valid commits without changed files", async () => {
  const commitSha = "b".repeat(64);
  const data = { ...details, commit: { ...details.commit, hash: commitSha }, files: [],
    summary: { fileCount: 0, additions: 0, deletions: 0, unavailableCount: 0 } };
  network.mockResolvedValueOnce(Response.json(success(data)));
  expect(await readProjectCommitDetailsAction(projectId, { ...params, commitSha })).toEqual(data);
  expect(network.mock.calls[0][0]).toBe(`/api/projects/${projectId}/commit/${commitSha}?source=local`);
});

it.each([
  { commitSha: "HEAD", source: "local" }, { commitSha: "a".repeat(7), source: "local" },
  { commitSha: "../other", source: "local" }, { commitSha: params.commitSha, source: "invalid" },
  { commitSha: params.commitSha }, { source: "local" },
  { ...params, source: ["local", "remote"] }, { ...params, sandboxId: "other" },
])("rejects invalid parameters before preparing a request: %j", async (input) => {
  expect(await readProjectCommitDetailsAction(projectId, input as Omit<ProjectCommitDetailsParamsSchema, "projectId">)).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("rejects an invalid project ID", async () => {
  expect(await readProjectCommitDetailsAction("../other", params)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each([{ userId: null, error: null }, { userId: "user", error: new Error("Unavailable") }])("skips requests without a verified session", async (value) => {
  session.mockResolvedValueOnce(value);
  expect(await readProjectCommitDetailsAction(projectId, params)).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it.each([null, " "])("skips requests without a usable session cookie", async (cookie) => {
  requestHeaders.mockResolvedValueOnce(new Headers(cookie === null ? undefined : { Cookie: cookie }));
  expect(await readProjectCommitDetailsAction(projectId, params)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each([401, 403, 404, 413, 502, 503])("returns null for HTTP %i even if the response contains valid data", async (status) => {
  network.mockResolvedValueOnce(Response.json(success(), { status }));
  expect(await readProjectCommitDetailsAction(projectId, params)).toBeNull();
});

it.each([
  null, { error: true, message: "Unavailable" }, { data: details },
  success({ ...details, commit: { ...details.commit, authorEmail: 42 } }),
  success({ ...details, files: [{ ...details.files[0], diff: null }] }),
  success({ ...details, summary: { ...details.summary, fileCount: "1" } }),
  success({ ...details, source: "remote" }),
  success({ ...details, commit: { ...details.commit, hash: "b".repeat(40) } }),
])("rejects invalid responses and responses for a different commit or source: %j", async (payload) => {
  network.mockResolvedValueOnce(Response.json(payload));
  expect(await readProjectCommitDetailsAction(projectId, params)).toBeNull();
});

it.each(["session", "headers", "network", "json", "abort"])("returns null when %s fails", async (stage) => {
  if (stage === "session") session.mockRejectedValueOnce(new Error("Session failed"));
  else if (stage === "headers") requestHeaders.mockRejectedValueOnce(new Error("Headers failed"));
  else if (stage === "json") network.mockResolvedValueOnce(new Response("invalid JSON"));
  else network.mockRejectedValueOnce(stage === "abort" ? new DOMException("Aborted", "AbortError") : new Error("Offline"));
  expect(await readProjectCommitDetailsAction(projectId, params)).toBeNull();
});

it.each(["before", "headers", "response", "json"])("discards a request cancelled during %s", async (stage) => {
  const controller = new AbortController();
  if (stage === "before") controller.abort();
  else if (stage === "headers") requestHeaders.mockImplementationOnce(async () => {
    controller.abort(); return new Headers({ Cookie: "session=test" });
  });
  else if (stage === "response") network.mockImplementationOnce(async () => {
    controller.abort(); return Response.json(success());
  });
  else {
    const response = Response.json(success());
    vi.spyOn(response, "json").mockImplementationOnce(async () => { controller.abort(); return success(); });
    network.mockResolvedValueOnce(response);
  }
  expect(await readProjectCommitDetailsAction(projectId, params, controller.signal)).toBeNull();
  if (stage === "before" || stage === "headers") expect(network).not.toHaveBeenCalled();
});
