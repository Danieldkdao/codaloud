import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "../actions/git-actions";

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
    createSearchParams: (params: Record<string, unknown>) => new URLSearchParams(
      Object.entries(params).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]),
    ),
  };
});

const projectId = "123e4567-e89b-42d3-a456-426614174000";
const sha = "a".repeat(40);
const counts = {
  currentBranch: "main", headSha: sha, upstream: null, upstreamSha: null,
  outgoing: null, incoming: null, isShallow: false, observedAt: "2026-09-15T12:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "owner", error: null });
  requestHeaders.mockResolvedValue(new Headers({ Cookie: "session=test" }));
});

type ActionCase = {
  name: string;
  call: (id: string, signal?: AbortSignal) => Promise<unknown>;
  path: string;
  data: unknown;
  body?: unknown;
  invalid?: () => Promise<unknown>;
};

const verifyAction = ({ name, call, path, data, body, invalid }: ActionCase) => {
  const mutation = body !== undefined;
  const success = { error: false, message: "Git request completed.", data };
  const failure = mutation ? expect.objectContaining({ error: true }) : null;
  describe(name, () => {
    it("sends an authenticated request and validates the response", async () => {
      network.mockResolvedValue(Response.json(success));
      expect(await call(projectId)).toEqual(mutation ? success : data);
      expect(session).toHaveBeenCalledOnce();
      expect(requestHeaders).toHaveBeenCalledExactlyOnceWith(...(mutation ? [{ "Content-Type": "application/json" }] : []));
      expect(network).toHaveBeenCalledExactlyOnceWith(`/api/projects/${projectId}/git/${path}`, {
        method: mutation ? "POST" : "GET",
        headers: await requestHeaders.mock.results[0].value,
        credentials: "omit",
        ...(mutation ? { body: JSON.stringify(body) } : { signal: undefined }),
      });
    });
    it.each([
      { userId: null, error: null },
      { userId: "owner", error: new Error("session unavailable") },
    ])("does not request without a verified user", async (value) => {
      session.mockResolvedValue(value);
      expect(await call(projectId)).toEqual(failure);
      expect(network).not.toHaveBeenCalled();
    });
    it("rejects invalid project IDs", async () => {
      expect(await call("../other")).toEqual(failure);
      expect(network).not.toHaveBeenCalled();
    });
    it.each([new Headers(), new Headers({ Cookie: " " })])("requires a usable cookie", async (headers) => {
      requestHeaders.mockResolvedValue(headers);
      expect(await call(projectId)).toEqual(failure);
      expect(network).not.toHaveBeenCalled();
    });
    it.each(["session", "headers"])("catches %s preparation failures", async (step) => {
      (step === "session" ? session : requestHeaders).mockRejectedValue(new Error("private details"));
      expect(await call(projectId)).toEqual(mutation ? expect.objectContaining({ error: true, code: "GIT_REQUEST_FAILED" }) : null);
      expect(network).not.toHaveBeenCalled();
    });
    it.each([200, 409, 503])("handles API errors at HTTP %s", async (status) => {
      const error = { error: true, code: "WORKSPACE_RESTORING", message: "Workspace restoring." };
      network.mockResolvedValue(Response.json(error, { status }));
      expect(await call(projectId)).toEqual(mutation ? error : null);
    });
    it.each(["http", "json", "network", "shape", "envelope"])("handles %s failure without retrying", async (kind) => {
      if (kind === "http") network.mockResolvedValue(Response.json(success, { status: 500 }));
      if (kind === "json") network.mockResolvedValue(new Response("invalid JSON"));
      if (kind === "network") network.mockRejectedValue(new Error("private detail"));
      if (kind === "shape") network.mockResolvedValue(Response.json({ ...success, data: {} }));
      if (kind === "envelope") network.mockResolvedValue(Response.json({ data }));
      expect(await call(projectId)).toEqual(mutation ? expect.objectContaining({ error: true, code: "GIT_OUTCOME_UNKNOWN" }) : null);
      expect(network).toHaveBeenCalledOnce();
    });
    if (invalid) it("rejects invalid input before sending", async () => {
      expect(await invalid()).toEqual(failure);
      expect(network).not.toHaveBeenCalled();
    });
    if (!mutation) {
      it("does not send already canceled reads", async () => {
        expect(await call(projectId, AbortSignal.abort())).toBeNull();
        expect(network).not.toHaveBeenCalled();
      });
      it("forwards cancellation and ignores a response canceled during parsing", async () => {
        const controller = new AbortController();
        const response = Response.json(success);
        vi.spyOn(response, "json").mockImplementation(async () => {
          controller.abort();
          return success;
        });
        network.mockResolvedValue(response);
        expect(await call(projectId, controller.signal)).toBeNull();
        expect(network.mock.calls[0][1]?.signal).toBe(controller.signal);
      });
    }
  });
};

verifyAction({
  name: "readProjectGitCountsAction",
  call: (id, signal) => actions.readProjectGitCountsAction(id, signal),
  path: "counts", data: counts,
});

verifyAction({
  name: "fetchProjectGitAction",
  call: (id) => actions.fetchProjectGitAction(id),
  path: "fetch", data: counts, body: {},
});

verifyAction({
  name: "pushProjectGitAction",
  call: (id) => actions.pushProjectGitAction(id, {}),
  path: "push", data: { pushed: true, remoteBranch: "main", remoteSha: sha, trackingUpdated: true, counts }, body: { force: false },
  invalid: () => actions.pushProjectGitAction(projectId, { force: true } as never),
});

it.each([null, sha])("preserves the explicit force-push lease %s", async (expectedRemoteSha) => {
  network.mockResolvedValue(Response.json({ error: true, code: "PUSH_REJECTED", message: "Remote changed." }));
  await actions.pushProjectGitAction(projectId, { force: true, expectedRemoteSha });
  expect(JSON.parse(network.mock.calls[0][1]?.body as string)).toEqual({ force: true, expectedRemoteSha });
});
