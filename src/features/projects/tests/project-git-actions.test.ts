import { beforeEach, expect, it, vi } from "vitest";
import { readProjectBranchesAction } from "@/features/projects/actions/git-actions";

const { network, session, requestHeaders } = vi.hoisted(() => ({
  network: vi.fn<typeof fetch>(),
  session: vi.fn(),
  requestHeaders: vi.fn<() => Promise<Headers>>(),
}));

vi.mock("@/lib/auth/client-helpers", () => ({ getCurrentUserClient: session }));
vi.mock("@/lib/utils", async (importOriginal) => {
  const { isValidIds } = await importOriginal<typeof import("@/lib/utils")>();
  return {
    fetchBase: network,
    createRequestHeaders: requestHeaders,
    isValidIds,
    createSearchParams: (params: Record<string, unknown>) => new URLSearchParams(Object.entries(params).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])),
  };
});

const projectId = "11111111-1111-4111-8111-111111111111";
const branches = { branches: ["feature/git", "main"], currentBranch: "main", nextCursor: null };
const success = (data: unknown = branches) => ({
  error: false,
  message: "Project branches loaded.",
  data,
});

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ userId: "user", error: null });
  requestHeaders.mockResolvedValue(new Headers({ Cookie: "session=test" }));
  network.mockResolvedValue(Response.json(success()));
});

it("requests project branches with the session cookie and returns parsed data", async () => {
  const signal = new AbortController().signal;
  network.mockResolvedValueOnce(Response.json(success({ ...branches, extra: true })));

  expect(await readProjectBranchesAction(projectId, {}, signal)).toEqual(branches);
  expect(session).toHaveBeenCalledOnce();
  expect(network).toHaveBeenCalledExactlyOnceWith(`/api/projects/${projectId}/branches?search=&pageSize=20`, {
    method: "GET",
    headers: new Headers({ Cookie: "session=test" }),
    credentials: "omit",
    signal,
  });
});

it.each([
  { branches: [], currentBranch: null, nextCursor: null },
  { branches: [], currentBranch: "main", nextCursor: null },
  { branches: ["main"], currentBranch: null, nextCursor: null },
])("preserves valid empty or detached branch data: %j", async (data) => {
  network.mockResolvedValueOnce(Response.json(success(data)));
  expect(await readProjectBranchesAction(projectId)).toEqual(data);
});

it.each([
  { userId: null, error: null },
  { userId: "user", error: new Error("Session unavailable") },
])("skips the request when the session is invalid: %j", async (value) => {
  session.mockResolvedValueOnce(value);
  expect(await readProjectBranchesAction(projectId)).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("rejects an invalid project ID before creating request headers", async () => {
  expect(await readProjectBranchesAction("../another-project")).toBeNull();
  expect(requestHeaders).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("skips the request if the session cookie is unavailable", async () => {
  requestHeaders.mockResolvedValueOnce(new Headers());
  expect(await readProjectBranchesAction(projectId)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each([401, 404, 503, 502])("returns null for HTTP %i even with valid data", async (status) => {
  network.mockResolvedValueOnce(Response.json(success(), { status }));
  expect(await readProjectBranchesAction(projectId)).toBeNull();
});

it.each([
  { ...success(), error: true },
  { data: branches },
  { ...success(), message: null },
  success({ branches: [42], currentBranch: "main" }),
  success({ branches: ["main"] }),
  null,
])("returns null for an invalid response: %j", async (payload) => {
  network.mockResolvedValueOnce(Response.json(payload));
  expect(await readProjectBranchesAction(projectId)).toBeNull();
});

it("returns null for malformed JSON", async () => {
  network.mockResolvedValueOnce(new Response("invalid JSON"));
  expect(await readProjectBranchesAction(projectId)).toBeNull();
});

it("normalizes search and safely encodes pagination parameters", async () => {
  const cursor = JSON.stringify({ version: 1, projectId, search: "feature/a&b", after: "feature/a&b/one" });
  const data = { branches: ["feature/a&b/two"], currentBranch: "main", nextCursor: null };
  network.mockResolvedValueOnce(Response.json(success(data)));
  expect(await readProjectBranchesAction(projectId, { search: " FEATURE/A&B ", cursor, pageSize: 1 })).toEqual(data);
  const url = new URL(String(network.mock.calls[0][0]), "https://codaloud.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({ search: "feature/a&b", cursor, pageSize: "1" });
});

it.each([
  { pageSize: 0 }, { pageSize: 101 }, { pageSize: 1.5 }, { search: "a".repeat(201) },
  { cursor: "invalid" }, { cursor: "" }, { search: "İ".repeat(200) },
  { cursor: JSON.stringify({ version: 1, projectId, search: "other", after: "main" }) },
])("rejects invalid pagination without a request: %j", async (params) => {
  expect(await readProjectBranchesAction(projectId, params)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it("returns a continuation cursor that can be passed back to the action", async () => {
  const cursor = JSON.stringify({ version: 1, projectId, search: "", after: "a" });
  const first = { branches: ["a"], currentBranch: "main", nextCursor: cursor };
  network.mockResolvedValueOnce(Response.json(success(first)));
  expect(await readProjectBranchesAction(projectId, { pageSize: 1 })).toEqual(first);
  network.mockResolvedValueOnce(Response.json(success({ branches: ["b"], currentBranch: "main", nextCursor: null })));
  expect(await readProjectBranchesAction(projectId, { cursor, pageSize: 1 })).toMatchObject({ branches: ["b"], nextCursor: null });
});

it.each([
  { branches: [], currentBranch: null, nextCursor: "invalid" },
  { branches: ["a"], currentBranch: null },
  { branches: ["a", "b"], currentBranch: null, nextCursor: null },
  { branches: ["a"], currentBranch: null, nextCursor: JSON.stringify({ version: 1, projectId, search: "other", after: "a" }) },
  { branches: ["a"], currentBranch: null, nextCursor: JSON.stringify({ version: 1, projectId, search: "", after: "wrong" }) },
])("rejects malformed or inconsistent page responses: %j", async (data) => {
  network.mockResolvedValueOnce(Response.json(success(data)));
  expect(await readProjectBranchesAction(projectId, { pageSize: 1 })).toBeNull();
});

it.each(["session", "headers", "network", "abort"])("catches %s failures", async (source) => {
  const failure = new Error(source);
  if (source === "session") session.mockRejectedValueOnce(failure);
  else if (source === "headers") requestHeaders.mockRejectedValueOnce(failure);
  else network.mockRejectedValueOnce(source === "abort" ? new DOMException("Aborted", "AbortError") : failure);

  expect(await readProjectBranchesAction(projectId)).toBeNull();
});


it("reports restoration metadata while preserving the data-or-null contract", async () => {
  const onFailure = vi.fn();
  network.mockResolvedValueOnce(Response.json({ error: true, code: "WORKSPACE_RESTORING" }, {
    status: 503, headers: { "Retry-After": "3" },
  }));
  expect(await readProjectBranchesAction(projectId, {}, undefined, onFailure)).toBeNull();
  expect(onFailure).toHaveBeenCalledExactlyOnceWith(503, "3", "WORKSPACE_RESTORING");
});

it("reports HTTP and network failures without retrying invalid response data or cancellations", async () => {
  const onFailure = vi.fn();
  network.mockResolvedValueOnce(new Response("gateway unavailable", { status: 502 }));
  await readProjectBranchesAction(projectId, {}, undefined, onFailure);
  expect(onFailure).toHaveBeenLastCalledWith(502, null, undefined);
  network.mockRejectedValueOnce(new TypeError("private request details"));
  await readProjectBranchesAction(projectId, {}, undefined, onFailure);
  expect(onFailure).toHaveBeenLastCalledWith(0, null);
  onFailure.mockClear();
  network.mockResolvedValueOnce(Response.json(success({ branches: [42] })));
  await readProjectBranchesAction(projectId, {}, undefined, onFailure);
  network.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
  await readProjectBranchesAction(projectId, {}, undefined, onFailure);
  expect(onFailure).not.toHaveBeenCalled();
});

it("does not start a canceled branch request", async () => {
  const onFailure = vi.fn();
  expect(await readProjectBranchesAction(projectId, {}, AbortSignal.abort(), onFailure)).toBeNull();
  expect(network).not.toHaveBeenCalled();
  expect(onFailure).not.toHaveBeenCalled();
});

it("requires a nonblank cookie for branch reads", async () => {
  requestHeaders.mockResolvedValueOnce(new Headers({ Cookie: " " }));
  expect(await readProjectBranchesAction(projectId)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each([200, 503])("ignores branch responses canceled during JSON parsing at HTTP %s", async (status) => {
  const onFailure = vi.fn();
  const controller = new AbortController();
  const response = Response.json(success(), { status });
  vi.spyOn(response, "json").mockImplementation(async () => {
    controller.abort();
    return status === 200 ? success() : { error: true, code: "WORKSPACE_RESTORING" };
  });
  network.mockResolvedValueOnce(response);
  expect(await readProjectBranchesAction(projectId, {}, controller.signal, onFailure)).toBeNull();
  expect(onFailure).not.toHaveBeenCalled();
});

vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
