import { beforeEach, describe, expect, it, vi } from "vitest";

import { readProjectAction } from "@/features/projects/actions/actions";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  platform: { OS: "web" },
}));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { getCookie: mocks.getCookie } }));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => mocks.platform.OS === "web" ? undefined : "https://api.codaloud.test/",
}));
vi.mock("react-native", () => ({ Platform: mocks.platform, Alert: { alert: vi.fn() } }));

const projectId = "abcdef00-0000-4000-8000-000000000001";
const project = {
  id: projectId, userId: "user-id", name: "My project", sandboxId: null,
  setupStatus: "pending", setupError: null, githubRepositoryId: null,
  lastOpenedFilePath: null, lastOpenedAt: null,
  createdAt: "2026-09-07T12:00:00.000Z", updatedAt: "2026-09-07T12:00:00.000Z",
};
const successBody = { error: false, message: "Project loaded successfully.", data: project };
const network = vi.fn<typeof fetch>();

beforeEach(() => {
  mocks.platform.OS = "web";
  mocks.getCookie.mockReset().mockResolvedValue("session=mobile");
  network.mockReset().mockImplementation(async () => Response.json(successBody));
  vi.stubGlobal("fetch", network);
});

describe("readProjectAction", () => {
  it.each(["web", "ios", "android"])("returns validated project data using %s session transport", async (os) => {
    mocks.platform.OS = os;
    const controller = new AbortController();
    expect(await readProjectAction(projectId, controller.signal)).toEqual(project);
    const [url, options] = network.mock.calls[0];
    expect(url).toBe(`${os === "web" ? "" : "https://api.codaloud.test"}/api/projects/${projectId}`);
    expect(options).toMatchObject({
      method: "GET", credentials: os === "web" ? "same-origin" : "omit", signal: controller.signal,
    });
    const headers = new Headers(options?.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Cookie")).toBe(os === "web" ? null : "session=mobile");
  });

  it.each(["", "invalid", "../projects", "123"])("rejects invalid ID %s before fetching", async (id) => {
    expect(await readProjectAction(id)).toBeNull();
    expect(network).not.toHaveBeenCalled();
    expect(mocks.getCookie).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 500])("returns null for HTTP %s even with a success body", async (status) => {
    network.mockResolvedValue(Response.json(successBody, { status }));
    expect(await readProjectAction(projectId)).toBeNull();
  });

  it.each([
    null, {}, { error: true, message: "Failed", data: project },
    { data: project }, { error: false, data: project },
    { ...successBody, data: null }, { ...successBody, data: {} },
    { ...successBody, data: { ...project, name: 123 } },
    { ...successBody, data: { ...project, setupStatus: "unknown" } },
    { ...successBody, data: { ...project, updatedAt: "invalid" } },
  ])("returns null for an error or invalid response: %j", async (body) => {
    network.mockResolvedValue(Response.json(body));
    expect(await readProjectAction(projectId)).toBeNull();
  });

  it("rejects a response for a different project", async () => {
    network.mockResolvedValue(Response.json({
      ...successBody, data: { ...project, id: "abcdef00-0000-4000-8000-000000000002" },
    }));
    expect(await readProjectAction(projectId)).toBeNull();
  });

  it("accepts an uppercase UUID matching the returned project", async () => {
    expect(await readProjectAction(projectId.toUpperCase())).toEqual(project);
  });

  it("returns null for malformed JSON", async () => {
    network.mockResolvedValue(new Response("invalid JSON"));
    expect(await readProjectAction(projectId)).toBeNull();
  });

  it.each(["network", "cookie", "abort"])("returns null when %s fails", async (stage) => {
    if (stage === "cookie") {
      mocks.platform.OS = "ios";
      mocks.getCookie.mockRejectedValue(new Error("Cookie failure"));
    } else {
      network.mockRejectedValue(stage === "abort"
        ? new DOMException("Aborted", "AbortError")
        : new Error("Network failure"));
    }
    expect(await readProjectAction(projectId)).toBeNull();
  });
});
