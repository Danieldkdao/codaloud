import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/changes+api";
import { SandboxFilesError } from "@/services/daytona/api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/services/daytona/changes", () => ({ readSandboxChanges: mocks.read }));
vi.mock("@/data/env/server", () => ({ serverEnv: {} }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));

const projectId = "11111111-1111-4111-8111-111111111111";
const snapshot = {
  repositoryState: "ready", currentBranch: "main", headSha: "a".repeat(40),
  isDetached: false, observedAt: "2026-09-13T12:00:00Z", changes: [],
};
const request = () => new Request(`https://codaloud.test/api/projects/${projectId}/changes`, {
  headers: { Cookie: "session=valid" },
});

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.read.mockReset().mockResolvedValue(snapshot);
});

it("returns a validated complete response with no pagination and private caching", async () => {
  const input = request();
  mocks.read.mockResolvedValue({ ...snapshot, privateToken: "secret" });
  const response = await GET(input, { projectId });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ error: false, message: "Project changes loaded.", data: snapshot });
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(input.headers, projectId, input.signal);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Cookie");
});

it("rejects missing sessions and invalid IDs before reading changes", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await GET(request(), { projectId })).status).toBe(401);
  mocks.user.mockResolvedValue({ userId: "owner" });
  expect((await GET(request(), { projectId: "invalid" })).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each(["branch=other", "page=1", "sandboxId=other", "projectId=other"])("rejects unsupported changes query parameters: %s", async (query) => {
  const response = await GET(new Request(`${request().url}?${query}`), { projectId });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVALID_GIT_INPUT" });
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each([
  [404, "PROJECT_NOT_FOUND"], [409, "WORKSPACE_NOT_READY"],
  [409, "WORKSPACE_CHANGED"], [413, "CHANGES_TOO_LARGE"], [503, "WORKSPACE_RESTORING"],
])("preserves safe service failures: %s %s", async (status, code) => {
  mocks.read.mockRejectedValue(new SandboxFilesError(Number(status), String(code), "Safe message."));
  const response = await GET(request(), { projectId });
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: true, code, message: "Safe message." });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Retry-After")).toBe(code === "WORKSPACE_RESTORING" ? "3" : null);
});

it("rejects malformed provider data and hides unexpected errors", async () => {
  mocks.read.mockResolvedValue({ ...snapshot, changes: [{ path: "partial" }] });
  expect((await GET(request(), { projectId })).status).toBe(502);
  mocks.read.mockRejectedValue(new Error("private provider credentials"));
  const response = await GET(request(), { projectId });
  expect(await response.json()).toEqual({ error: true, code: "CHANGES_UNAVAILABLE", message: "Unable to load project changes. Please try again." });
});
