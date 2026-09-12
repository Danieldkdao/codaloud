import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/projects/[projectId]/code-intelligence+api";

const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), analyze: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/projects/server/projects", () => ({ confirmUserProjectOwnership: mocks.project }));
vi.mock("@/services/daytona/typescript", () => ({ readSandboxCodeIntelligence: mocks.analyze }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://codaloud.test" }));
vi.mock("@/data/env/server", () => ({ serverEnv: { DAYTONA_API_KEY: "test-key" } }));
const projectId = "abcdef00-0000-4000-8000-000000000001";
const input = { path: "demo.ts", content: "const value = 1;" };
const request = (body: unknown = input) => new Request("https://codaloud.test/api/analysis", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ userId: "owner" });
  mocks.project.mockReset().mockResolvedValue({ id: projectId, sandboxId: "sandbox", setupStatus: "ready", githubRepositoryId: null });
  mocks.analyze.mockReset().mockResolvedValue({ diagnostics: [] });
});
it("checks ownership and passes the unsaved snapshot into sandbox analysis", async () => {
  const result = await POST(request(), { projectId });
  expect(mocks.project).toHaveBeenCalledWith("owner", projectId);
  expect(mocks.analyze).toHaveBeenCalledWith({ projectId, sandboxId: "sandbox", allowInitialize: true }, input);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await result.json()).toMatchObject({ error: false, data: { diagnostics: [] } });
});
it("rejects unauthorized and invalid requests before executing sandbox code", async () => {
  mocks.user.mockResolvedValue({ userId: null });
  expect((await POST(request(), { projectId })).status).toBe(401);
  mocks.user.mockResolvedValue({ userId: "owner" });
  for (const body of [{ ...input, path: "../demo.ts" }, { ...input, position: 999 }, { ...input, content: "a".repeat(1024 * 1024 + 1) }, { ...input, path: "notes.md" }]) {
    expect((await POST(request(body), { projectId })).status).toBe(400);
  }
  mocks.project.mockResolvedValue(null);
  expect((await POST(request(), { projectId })).status).toBe(404);
  expect(mocks.analyze).not.toHaveBeenCalled();
});
it("reports analysis failures without exposing private server errors", async () => {
  mocks.analyze.mockRejectedValue(new Error("secret"));
  const result = await POST(request(), { projectId });
  expect(result.status).toBe(502);
  expect(JSON.stringify(await result.json())).not.toContain("secret");
});
