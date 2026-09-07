import { beforeEach, expect, it, vi } from "vitest";

import { updateProjectAction } from "@/features/projects/actions/actions";
import type { UpdateProjectSchema } from "@/features/projects/actions/schemas";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getCookie: vi.fn(), platform: { OS: "web" },
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getSession: mocks.getSession, getCookie: mocks.getCookie },
}));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => mocks.platform.OS === "web" ? undefined : "https://api.codaloud.test/",
}));
vi.mock("react-native", () => ({ Platform: mocks.platform, Alert: { alert: vi.fn() } }));

const userId = "abcdef00-0000-4000-8000-000000000001";
const projectId = "abcdef00-0000-4000-8000-000000000002";
const project = {
  id: projectId, userId, name: "Renamed project", sandboxId: null,
  setupStatus: "pending", setupError: null, githubRepositoryId: null,
  lastOpenedFilePath: null, lastOpenedAt: null,
  createdAt: "2026-09-07T12:00:00.000Z", updatedAt: "2026-09-07T13:00:00.000Z",
};
const successBody = { error: false, message: "Project updated successfully.", data: project };
const network = vi.fn<typeof fetch>();
const update = () => updateProjectAction(projectId, { name: " Renamed project " });

beforeEach(() => {
  mocks.platform.OS = "web";
  mocks.getSession.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.getCookie.mockReset().mockResolvedValue("session=mobile");
  network.mockReset().mockImplementation(async () => Response.json(successBody));
  vi.stubGlobal("fetch", network);
});

it.each([null, "", "invalid"])("rejects missing or invalid user ID %s before sending a request", async (id) => {
  mocks.getSession.mockResolvedValue({ data: id === null ? null : { user: { id } }, error: null });
  expect(await update()).toMatchObject({ error: true, message: expect.any(String) });
  expect(network).not.toHaveBeenCalled();
});

it("handles session verification errors before sending a request", async () => {
  mocks.getSession.mockResolvedValue({ data: { user: { id: userId } }, error: { message: "Private details" } });
  expect(await update()).toEqual({ error: true, message: "Unable to verify your session. Please try again." });
  expect(network).not.toHaveBeenCalled();
});

it.each(["", "invalid", "../projects"])("rejects invalid project ID %s", async (id) => {
  expect(await updateProjectAction(id, { name: "Renamed" })).toEqual({ error: true, message: "Invalid project ID." });
  expect(network).not.toHaveBeenCalled();
});

it.each([{}, { name: undefined }, { name: " " }, { name: "x".repeat(101) }, { source: "github" }])("rejects invalid update %j", async (data) => {
  expect(await updateProjectAction(projectId, data as UpdateProjectSchema)).toMatchObject({ error: true, message: expect.any(String) });
  expect(network).not.toHaveBeenCalled();
});

it.each(["web", "ios", "android"])("sends validated PATCH data with %s authentication", async (os) => {
  mocks.platform.OS = os;
  expect(await update()).toEqual({ error: false, message: successBody.message, projectId });
  const [url, options] = network.mock.calls[0];
  expect(url).toBe(`${os === "web" ? "" : "https://api.codaloud.test"}/api/projects/${projectId}`);
  expect(options).toMatchObject({ method: "PATCH", credentials: os === "web" ? "same-origin" : "omit" });
  expect(JSON.parse(String(options?.body))).toEqual({ name: "Renamed project" });
  const headers = new Headers(options?.headers);
  expect(headers.get("Content-Type")).toBe("application/json");
  expect(headers.get("Cookie")).toBe(os === "web" ? null : "session=mobile");
});

it.each([200, 401, 404, 500])("returns the API error for status %s", async (status) => {
  const body = { error: true, message: "Project not found." };
  network.mockResolvedValue(Response.json(body, { status }));
  expect(await update()).toEqual(body);
});

it("rejects a success body with a failed HTTP status", async () => {
  network.mockResolvedValue(Response.json(successBody, { status: 500 }));
  expect(await update()).toEqual({ error: true, message: "Unable to update project. Please try again." });
});

it.each([null, {}, { ...successBody, data: {} }, { ...successBody, data: { ...project, name: 42 } },
  { ...successBody, data: { ...project, id: userId } },
  { ...successBody, data: { ...project, userId: projectId } },
])("rejects invalid or mismatched response %j", async (body) => {
  network.mockResolvedValue(Response.json(body));
  expect(await update()).toEqual({ error: true, message: "The server returned an invalid project response." });
});

it.each(["session", "cookie", "network", "json"])("catches %s failures", async (stage) => {
  if (stage === "session") mocks.getSession.mockRejectedValue(new Error("Private details"));
  if (stage === "cookie") {
    mocks.platform.OS = "ios";
    mocks.getCookie.mockRejectedValue(new Error("Private details"));
  }
  if (stage === "network") network.mockRejectedValue(new Error("Private details"));
  if (stage === "json") network.mockResolvedValue(new Response("Bad gateway", { status: 502 }));
  expect(await update()).toEqual({ error: true, message: "Unable to update project. Please try again." });
});
