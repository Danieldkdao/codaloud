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
    data: { branches: ["main", "feature/voice"], currentBranch: "main" },
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
