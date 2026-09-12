import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/branches+api";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), project: vi.fn(), getSandbox: vi.fn(), home: vi.fn(),
  branches: vi.fn(), configure: vi.fn(), fetch: vi.fn(),
}));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "server-key", DAYTONA_TARGET: "us" } }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("@daytona/sdk", () => ({
  Daytona: class {
    constructor(options: unknown) { mocks.configure(options); }
    get = mocks.getSandbox;
  },
  DaytonaNotFoundError: class extends Error {},
}));

const projectId = "abcdef00-0000-4000-8000-000000000001";
const userId = "abcdef00-0000-4000-8000-000000000002";
const project = { id: projectId, sandboxId: "owned-sandbox", setupStatus: "ready", deletionRequested: false, githubRepositoryId: null };
const sandbox = {
  id: "owned-sandbox", state: "started",
  labels: { codaloudApp: "codaloud", codaloudProjectId: projectId },
  getUserHomeDir: mocks.home, git: { branches: mocks.branches },
};
const request = () => new Request(`https://codaloud.test/api/projects/${projectId}/branches`, {
  headers: { Cookie: "session=valid" },
});

const readPage = async (params: Record<string, string | undefined> = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, value);
  }
  const response = await GET(new Request(`${request().url}?${query}`), { projectId });
  return { response, body: await response.json() };
};

it("searches before paginating and traverses sorted, unique branches to exhaustion", async () => {
  mocks.branches.mockResolvedValue({ branches: ["main", "feature/z", "feature/b", "Feature/A", "feature/b"], current: "main" });
  const first = await readPage({ search: " FEATURE/ ", pageSize: "2" });
  expect(first.body.data).toEqual({ branches: ["Feature/A", "feature/b"], currentBranch: "main", nextCursor: expect.any(String) });
  const second = await readPage({ search: "feature/", pageSize: "2", cursor: first.body.data.nextCursor });
  expect(second.body.data).toEqual({ branches: ["feature/z"], currentBranch: "main", nextCursor: null });
  expect((await readPage({ search: "missing" })).body.data).toEqual({ branches: [], currentBranch: "main", nextCursor: null });
});

it("continues after a deleted cursor branch without skipping remaining names", async () => {
  mocks.branches.mockResolvedValueOnce({ branches: ["a", "b", "c"], current: "a" });
  const first = await readPage({ pageSize: "1" });
  mocks.branches.mockResolvedValue({ branches: ["b", "c"], current: "b" });
  const second = await readPage({ pageSize: "2", cursor: first.body.data.nextCursor });
  expect(second.body.data).toEqual({ branches: ["b", "c"], currentBranch: "b", nextCursor: null });
});

it("uses the default page size and returns no cursor for an exact final page", async () => {
  mocks.branches.mockResolvedValue({ branches: Array.from({ length: 21 }, (_, i) => `branch-${i.toString().padStart(2, "0")}`) });
  const first = await readPage();
  expect(first.body.data.branches).toHaveLength(20);
  expect(first.body.data.nextCursor).toEqual(expect.any(String));
  expect((await readPage({ pageSize: "21" })).body.data.nextCursor).toBeNull();
});

it.each([
  { pageSize: "0" }, { pageSize: "101" }, { pageSize: "1.5" }, { pageSize: "abc" },
  { search: "a".repeat(201) }, { search: "İ".repeat(200) }, { cursor: "" }, { cursor: "not-json" }, { cursor: "{}" },
])("rejects invalid pagination before project or sandbox access: %j", async (params) => {
  const { response, body } = await readPage(params);
  expect(response.status).toBe(400);
  expect(body).toMatchObject({ error: true, code: "INVALID_BRANCH_PARAMS" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.getSandbox).not.toHaveBeenCalled();
});

it("rejects cursors from another search or project before loading", async () => {
  const cursor = JSON.stringify({ version: 1, projectId, search: "feature", after: "feature/a" });
  for (const token of [cursor, JSON.stringify({ version: 1, projectId: userId, search: "", after: "main" })]) {
    expect((await readPage({ cursor: token })).response.status).toBe(400);
  }
  expect(mocks.getSandbox).not.toHaveBeenCalled();
});

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId });
  mocks.project.mockReset().mockResolvedValue(project);
  mocks.getSandbox.mockReset().mockResolvedValue(sandbox);
  mocks.home.mockReset().mockResolvedValue("/home/daytona");
  mocks.branches.mockReset().mockResolvedValue({ branches: ["main", "feature/voice"], current: "main" });
  mocks.configure.mockClear();
  mocks.fetch.mockReset().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", mocks.fetch);
});

it("reads the owned sandbox's branches without requiring GitHub credentials", async () => {
  const input = request();
  const response = await GET(input, { projectId });
  expect(mocks.user).toHaveBeenCalledExactlyOnceWith(input.headers);
  expect(mocks.project).toHaveBeenCalledExactlyOnceWith(userId, projectId);
  expect(mocks.configure).toHaveBeenCalledExactlyOnceWith({ apiKey: "server-key", target: "us", otelEnabled: false, requestTimeoutMs: 15_000 });
  expect(mocks.getSandbox).toHaveBeenCalledExactlyOnceWith("owned-sandbox");
  expect(mocks.branches).toHaveBeenCalledExactlyOnceWith("/home/daytona/.codaloud/workspace");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect(await response.json()).toEqual({
    error: false, message: "Project branches loaded.",
    data: { branches: ["feature/voice", "main"], currentBranch: "main", nextCursor: null },
  });
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("rejects missing sessions and invalid IDs before project or sandbox access", async () => {
  mocks.user.mockResolvedValueOnce({ userId: null });
  const unauthenticated = await GET(request(), { projectId });
  expect(unauthenticated.status).toBe(401);
  expect(await unauthenticated.json()).toMatchObject({ error: true, code: "UNAUTHENTICATED" });
  expect((await GET(request(), { projectId: "invalid" })).status).toBe(400);
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.getSandbox).not.toHaveBeenCalled();
});

it.each([
  [null, 404, "PROJECT_NOT_FOUND"],
  [{ ...project, deletionRequested: true }, 409, "PROJECT_DELETING"],
  [{ ...project, setupStatus: "pending" }, 409, "WORKSPACE_NOT_READY"],
  [{ ...project, sandboxId: null }, 409, "WORKSPACE_NOT_READY"],
] as const)("rejects inaccessible projects before contacting Daytona: %j", async (value, status, code) => {
  mocks.project.mockResolvedValue(value);
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: true, code });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.getSandbox).not.toHaveBeenCalled();
});

it.each([
  { ...sandbox, id: "another-sandbox" },
  { ...sandbox, labels: { codaloudApp: "another-app", codaloudProjectId: projectId } },
  { ...sandbox, labels: { codaloudApp: "codaloud", codaloudProjectId: "another-project" } },
])("rejects sandbox ownership mismatches before reading repository data", async (value) => {
  mocks.getSandbox.mockResolvedValue(value);
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: true, code: "SANDBOX_MISMATCH" });
  expect(mocks.home).not.toHaveBeenCalled();
  expect(mocks.branches).not.toHaveBeenCalled();
});

it.each(["stopped", "archived", "starting", "restoring"])("preserves restoration behavior for %s sandboxes", async (state) => {
  mocks.getSandbox.mockResolvedValue({ ...sandbox, state });
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("3");
  expect(await response.json()).toMatchObject({ error: true, code: "WORKSPACE_RESTORING" });
  if (state === "stopped" || state === "archived") {
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("https://app.daytona.io/api/sandbox/owned-sandbox/start", expect.objectContaining({ method: "POST" }));
    const headers = new Headers(mocks.fetch.mock.calls[0][1].headers);
    expect(headers.get("Authorization")).toBe("Bearer server-key");
  } else expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.branches).not.toHaveBeenCalled();
});

it("reports a missing sandbox without replacing it", async () => {
  const { DaytonaNotFoundError } = await import("@daytona/sdk");
  mocks.getSandbox.mockRejectedValue(new DaytonaNotFoundError("private details"));
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: true, code: "SANDBOX_MISSING" });
  expect(mocks.branches).not.toHaveBeenCalled();
});

it.each([
  { branches: [], current: "" },
  { branches: [], current: "main" },
  { branches: ["main"], current: "" },
  { branches: ["main"] },
])("preserves empty lists and normalizes absent current branch: %j", async (value) => {
  mocks.branches.mockResolvedValue(value);
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: { branches: value.branches, currentBranch: value.current || null } });
});

it("ignores caller-supplied sandbox IDs and repository paths", async () => {
  const input = new Request(`${request().url}?sandboxId=other&path=/etc&repositoryId=other`);
  await GET(input, { projectId });
  expect(mocks.getSandbox).toHaveBeenCalledExactlyOnceWith("owned-sandbox");
  expect(mocks.branches).toHaveBeenCalledExactlyOnceWith("/home/daytona/.codaloud/workspace");
});

it.each([null, {}, { branches: "main" }, { branches: [1] }, { branches: [""] }, { branches: [], current: 42 }])("does not return malformed provider data as success: %j", async (value) => {
  mocks.branches.mockResolvedValue(value);
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: true });
});

it.each([undefined, "", "relative/home"])("rejects invalid sandbox home paths: %j", async (home) => {
  mocks.home.mockResolvedValue(home);
  expect((await GET(request(), { projectId })).status).toBe(502);
  expect(mocks.branches).not.toHaveBeenCalled();
});

it("hides SDK and server errors and marks failure responses private", async () => {
  for (const operation of [mocks.user, mocks.project, mocks.getSandbox, mocks.home, mocks.branches]) {
    operation.mockRejectedValueOnce(new Error("server-key private-provider-details"));
    const response = await GET(request(), { projectId });
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.text()).not.toMatch(/server-key|private-provider-details/);
  }
});
