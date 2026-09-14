import { beforeEach, expect, it, vi } from "vitest";
import { createProjectCommitAction } from "../actions/git-actions";
import type { CreateProjectCommitSchema } from "../actions/create-commit-schemas";

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

const projectId = "123e4567-e89b-42d3-a456-426614174000";
const input = { message: "Update files", paths: ["src/file.ts", " spaced\nname.txt ", "*.txt"] };
const success = {
  error: false,
  message: "Selected changes committed.",
  data: { hash: "b".repeat(40), currentBranch: "main", parentHash: "a".repeat(40) },
};

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "owner", error: null });
  requestHeaders.mockResolvedValue(new Headers({ Cookie: "session=test", "Content-Type": "application/json" }));
  network.mockResolvedValue(Response.json(success));
});

it("posts the normalized message and exact selected paths with session authentication", async () => {
  expect(await createProjectCommitAction(projectId, { ...input, message: "  Update files  " })).toEqual(success);
  expect(session).toHaveBeenCalledOnce();
  expect(requestHeaders).toHaveBeenCalledExactlyOnceWith({ "Content-Type": "application/json" });
  expect(network).toHaveBeenCalledExactlyOnceWith(`/api/projects/${projectId}/commits`, {
    method: "POST",
    headers: await requestHeaders.mock.results[0].value,
    credentials: "omit",
    body: JSON.stringify(input),
  });
});

it.each([
  { userId: null, error: null },
  { userId: "owner", error: new Error("Session failed") },
])("rejects a missing or unverifiable session before preparing a request", async (value) => {
  session.mockResolvedValue(value);
  expect(await createProjectCommitAction(projectId, input)).toMatchObject({ error: true });
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("rejects an invalid project ID before sending a request", async () => {
  expect(await createProjectCommitAction("../other", input)).toMatchObject({ error: true, code: "INVALID_PROJECT" });
  expect(network).not.toHaveBeenCalled();
});

it.each([
  { ...input, paths: [] },
  { ...input, paths: ["../outside"] },
  { ...input, paths: ["file.ts", "file.ts"] },
  { ...input, message: " " },
  { ...input, author: "someone else" },
  null,
])("rejects invalid action input without sending a request: %j", async (value) => {
  expect(await createProjectCommitAction(projectId, value as unknown as CreateProjectCommitSchema))
    .toMatchObject({ error: true, code: "INVALID_COMMIT_INPUT" });
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it.each([new Headers(), new Headers({ Cookie: " " })])("requires a usable session cookie", async (headers) => {
  requestHeaders.mockResolvedValue(headers);
  expect(await createProjectCommitAction(projectId, input)).toMatchObject({ error: true, code: "UNAUTHENTICATED" });
  expect(network).not.toHaveBeenCalled();
});

it.each(["session", "headers"])("reports a %s exception as a failure before submission", async (step) => {
  (step === "session" ? session : requestHeaders).mockRejectedValue(new Error("private detail"));
  expect(await createProjectCommitAction(projectId, input)).toMatchObject({ error: true, code: "COMMIT_REQUEST_UNAVAILABLE" });
  expect(network).not.toHaveBeenCalled();
});

it.each([
  [409, "COMMIT_SELECTION_CHANGED"],
  [503, "WORKSPACE_RESTORING"],
  [502, "COMMIT_STAGING_OUTCOME_UNKNOWN"],
  [502, "COMMIT_OUTCOME_UNKNOWN"],
  [200, "COMMIT_FAILED"],
] as const)("preserves a validated server error for HTTP %s: %s", async (status, code) => {
  const failure = { error: true, code, message: "Safe server message." };
  network.mockResolvedValue(Response.json(failure, { status }));
  expect(await createProjectCommitAction(projectId, input)).toEqual(failure);
  expect(network).toHaveBeenCalledOnce();
});

it("accepts the initial commit with no parent", async () => {
  const initial = { ...success, data: { ...success.data, parentHash: null } };
  network.mockResolvedValue(Response.json(initial));
  expect(await createProjectCommitAction(projectId, input)).toEqual(initial);
});

it.each([
  null,
  { ...success, data: { ...success.data, hash: "invalid" } },
  { ...success, data: { hash: success.data.hash } },
  { error: true, message: 42 },
])("rejects unconfirmed response data: %j", async (payload) => {
  network.mockResolvedValue(Response.json(payload));
  expect(await createProjectCommitAction(projectId, input)).toMatchObject({ error: true, code: "COMMIT_OUTCOME_UNKNOWN" });
  expect(network).toHaveBeenCalledOnce();
});

it.each(["http", "json", "network"])("handles %s failures without retrying a possible commit", async (kind) => {
  if (kind === "http") network.mockResolvedValue(Response.json(success, { status: 500 }));
  if (kind === "json") network.mockResolvedValue(new Response("invalid JSON"));
  if (kind === "network") network.mockRejectedValue(new Error("private transport detail"));
  const result = await createProjectCommitAction(projectId, input);
  expect(result).toMatchObject({ error: true, code: "COMMIT_OUTCOME_UNKNOWN" });
  expect(result.message).toContain("Refresh commit history");
  expect(network).toHaveBeenCalledOnce();
});
