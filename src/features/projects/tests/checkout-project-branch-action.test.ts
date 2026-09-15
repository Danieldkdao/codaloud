import { beforeEach, expect, it, vi } from "vitest";
import { checkoutProjectBranchAction } from "@/features/projects/actions/git-actions";
import type { CheckoutProjectBranchSchema } from "@/features/projects/actions/branch-schemas";

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
const input = { branchName: "feature/checkout" };
const success = {
  error: false,
  message: "Branch checked out successfully.",
  data: { previousBranch: "main", currentBranch: input.branchName },
};
const unconfirmed = {
  error: true,
  code: "CHECKOUT_OUTCOME_UNKNOWN",
  message: "Unable to confirm the branch switch. Refresh the current branch and files before trying again.",
};

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "user", error: null });
  requestHeaders.mockResolvedValue(new Headers({ Cookie: "session=test", "Content-Type": "application/json" }));
  network.mockResolvedValue(Response.json(success));
});

it("posts validated input with session authentication and returns the confirmed checkout", async () => {
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual(success);
  expect(session).toHaveBeenCalledOnce();
  expect(requestHeaders).toHaveBeenCalledExactlyOnceWith({ "Content-Type": "application/json" });
  expect(network).toHaveBeenCalledExactlyOnceWith(`/api/projects/${projectId}/checkout`, {
    method: "POST",
    headers: await requestHeaders.mock.results[0].value,
    credentials: "omit",
    body: JSON.stringify(input),
  });
});

it("forwards explicit remote source to the checkout endpoint", async () => {
  expect(await checkoutProjectBranchAction(projectId, { ...input, source: "remote" })).toEqual(success);
  expect(network.mock.calls[0][1]?.body).toBe(JSON.stringify({ ...input, source: "remote" }));
});

it.each([
  [{ userId: null, error: null }, "Sign in to switch branches."],
  [{ userId: "user", error: new Error("Session unavailable") }, "Unable to verify your session. Please try again."],
])("rejects an unauthenticated or unverifiable session: %j", async (value, message) => {
  session.mockResolvedValueOnce(value);
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual({ error: true, message });
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("rejects an invalid project before sending a request", async () => {
  expect(await checkoutProjectBranchAction("../other-project", input)).toEqual({ error: true, message: "Invalid project ID." });
  expect(network).not.toHaveBeenCalled();
});

it.each([{ branchName: "--force" }, { branchName: "main", force: true }, { branchName: "" }, null])(
  "rejects invalid checkout input before sending a request: %j", async (value) => {
    expect(await checkoutProjectBranchAction(projectId, value as unknown as CheckoutProjectBranchSchema)).toEqual({
      error: true, message: expect.any(String),
    });
    expect(requestHeaders).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  },
);

it.each([new Headers(), new Headers({ Cookie: " " })])("requires a usable session cookie", async (headers) => {
  requestHeaders.mockResolvedValueOnce(headers);
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual({ error: true, message: "Sign in to switch branches." });
  expect(network).not.toHaveBeenCalled();
});

it.each([
  [409, { error: true, code: "CHECKOUT_CHANGES_CONFLICT", message: "Commit or stash your changes. Affected files: src/app.ts" }],
  [401, { error: true, message: "Sign in to switch branches." }],
  [502, { ...unconfirmed, message: "The workspace may already have switched branches. Refresh before retrying." }],
])("preserves validated server failures for HTTP %i", async (status, failure) => {
  network.mockResolvedValueOnce(Response.json(failure, { status }));
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual(failure);
  expect(network).toHaveBeenCalledOnce();
});

it.each([null, input.branchName])("accepts detached and already-selected previous branches: %s", async (previousBranch) => {
  const result = { ...success, data: { ...success.data, previousBranch } };
  network.mockResolvedValueOnce(Response.json(result));
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual(result);
});

it.each([
  null,
  { ...success, data: { ...success.data, currentBranch: "other" } },
  { ...success, data: { currentBranch: input.branchName } },
  { ...success, message: null },
  { error: true, message: 42 },
  { error: true, message: "" },
  { error: true, message: "Failed", code: 42 },
])("returns an unconfirmed outcome for an invalid or mismatched response: %j", async (payload) => {
  network.mockResolvedValueOnce(Response.json(payload));
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual(unconfirmed);
});

it("rejects success-shaped data when the HTTP request failed", async () => {
  network.mockResolvedValueOnce(Response.json(success, { status: 500 }));
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual(unconfirmed);
});

it("handles malformed JSON and a lost response without retrying the mutation", async () => {
  network.mockResolvedValueOnce(new Response("invalid JSON"));
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual(unconfirmed);
  network.mockRejectedValueOnce(new Error("Connection lost"));
  expect(await checkoutProjectBranchAction(projectId, input)).toEqual(unconfirmed);
  expect(network).toHaveBeenCalledTimes(2);
});
