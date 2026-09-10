import { beforeEach, describe, expect, it, vi } from "vitest";

import { readUserProjectsAction } from "@/features/projects/actions/actions";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  platform: { OS: "ios" },
}));

vi.mock("@/lib/auth/auth-client", () => ({ authClient: { getCookie: mocks.getCookie } }));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => "https://api.codaloud.test/",
}));
vi.mock("react-native", () => ({ Platform: mocks.platform, Alert: { alert: vi.fn() } }));

const network = vi.fn<typeof fetch>();
const projects = [{
  id: "project-id", userId: "user-id", name: "My project", sandboxId: null,
  setupStatus: "pending", setupError: null, githubRepositoryId: null,
  lastOpenedFilePath: null, lastOpenedAt: null,
  createdAt: "2026-09-07T12:00:00.000Z", updatedAt: "2026-09-07T12:00:00.000Z",
}];

const projectPage = { projects, nextCursor: null };
const cursor = JSON.stringify({ version: 1, id: "00000000-0000-4000-8000-000000000001", value: "Previous", search: "My & project", sortBy: "name", sortOrder: "desc" });

beforeEach(() => {
  mocks.platform.OS = "ios";
  mocks.getCookie.mockResolvedValue("session=mobile");
  network.mockReset();
  network.mockImplementation(async () => Response.json({ error: false, message: "Loaded", data: projectPage }));
  vi.stubGlobal("fetch", network);
});

describe("readUserProjectsAction", () => {
  it("passes the query's cancellation signal to fetch", async () => {
    const controller = new AbortController();
    await readUserProjectsAction({}, controller.signal);
    expect(network.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("returns data and sends normalized filters with pagination", async () => {
    expect(await readUserProjectsAction({ search: "  My & project  ", cursor, sortBy: "name" })).toEqual(projectPage);
    const [path, options] = network.mock.calls[0];
    const url = new URL(String(path), "https://codaloud.test");
    expect(url.pathname).toBe("/api/projects");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "My & project", cursor, pageSize: "20", sortBy: "name", sortOrder: "desc",
    });
    expect(options?.method).toBe("GET");
  });

  it("uses defaults when params are omitted and preserves empty results", async () => {
    network.mockResolvedValue(Response.json({ error: false, message: "Loaded", data: { projects: [], nextCursor: null } }));
    expect(await readUserProjectsAction()).toEqual({ projects: [], nextCursor: null });
    const url = new URL(String(network.mock.calls[0][0]), "https://codaloud.test");
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.get("pageSize")).toBe("20");
  });

  it("returns null for invalid params before fetching", async () => {
    expect(await readUserProjectsAction({ pageSize: 101 })).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(["ios", "android"])("uses session transport for %s", async (os) => {
    mocks.platform.OS = os;
    await readUserProjectsAction();
    const [url, options] = network.mock.calls[0];
    expect(String(url).startsWith("https://api.codaloud.test/api/projects?")).toBe(true);
    expect(options?.credentials).toBe("omit");
    expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
  });

  it.each([400, 401, 403, 500])("returns null for HTTP %s even with a success body", async (status) => {
    network.mockResolvedValue(Response.json({ error: false, message: "Loaded", data: projectPage }, { status }));
    expect(await readUserProjectsAction()).toBeNull();
  });

  it.each([
    null, {}, { error: true, message: "Failed" }, { error: false },
    { error: false, data: null }, { error: false, data: {} }, { data: projectPage },
  ])("returns null for an error or unusable response: %j", async (body) => {
    network.mockResolvedValue(Response.json(body));
    expect(await readUserProjectsAction()).toBeNull();
  });

  it.each([
    { projects }, { projects, nextCursor: 3 }, { projects, nextCursor: "invalid" },
    { projects: [], nextCursor: cursor },
  ])("rejects invalid page metadata: %j", async (data) => {
    network.mockResolvedValue(Response.json({ error: false, message: "Loaded", data }));
    expect(await readUserProjectsAction()).toBeNull();
  });

  it("returns the validated server cursor", async () => {
    const data = { projects, nextCursor: cursor };
    network.mockResolvedValue(Response.json({ error: false, message: "Loaded", data }));
    expect(await readUserProjectsAction({ search: "My & project", sortBy: "name" })).toEqual(data);
  });

  it("rejects a repeated cursor instead of allowing endless pagination", async () => {
    network.mockResolvedValue(Response.json({ error: false, message: "Loaded", data: { projects, nextCursor: cursor } }));
    expect(await readUserProjectsAction({ cursor, search: "My & project", sortBy: "name" })).toBeNull();
  });

  it("rejects a response cursor for different filters", async () => {
    network.mockResolvedValue(Response.json({ error: false, message: "Loaded", data: { projects, nextCursor: cursor } }));
    expect(await readUserProjectsAction()).toBeNull();
  });

  it("returns null when JSON parsing fails", async () => {
    network.mockResolvedValue(new Response("invalid JSON"));
    expect(await readUserProjectsAction()).toBeNull();
  });

  it.each([
    null, "project", {},
    { ...projects[0], setupStatus: undefined },
    { ...projects[0], setupStatus: "unknown" },
    { ...projects[0], id: 123 },
    { ...projects[0], id: "" },
    { ...projects[0], userId: null },
    { ...projects[0], name: {} },
    { ...projects[0], sandboxId: 123 },
    { ...projects[0], setupError: false },
    { ...projects[0], githubRepositoryId: 123 },
    { ...projects[0], lastOpenedFilePath: [] },
    { ...projects[0], lastOpenedAt: "invalid date" },
    { ...projects[0], createdAt: null },
    { ...projects[0], updatedAt: "invalid date" },
  ])("rejects the whole page when any project is malformed: %j", async (invalidProject) => {
    network.mockResolvedValue(Response.json({
      error: false, message: "Loaded", data: { projects: [...projects, invalidProject], nextCursor: null },
    }));
    expect(await readUserProjectsAction()).toBeNull();
  });

  it.each(["pending", "running", "ready", "failed"])("preserves valid %s projects and populated nullable fields", async (setupStatus) => {
    const data = [{
      ...projects[0], setupStatus, sandboxId: "sandbox-id", setupError: "Setup details",
      githubRepositoryId: "123", lastOpenedFilePath: "src/index.ts",
      lastOpenedAt: "2026-09-07T12:00:00.000Z",
    }];
    network.mockResolvedValue(Response.json({ error: false, message: "Loaded", data: { projects: data, nextCursor: null } }));
    expect(await readUserProjectsAction()).toEqual({ projects: data, nextCursor: null });
  });

  it.each(["request", "cookie"])("returns null when %s throws", async (stage) => {
    if (stage === "cookie") {
      mocks.platform.OS = "ios";
      mocks.getCookie.mockRejectedValue(new Error("Cookie failure"));
    } else {
      network.mockRejectedValue(new Error("Network failure"));
    }
    expect(await readUserProjectsAction()).toBeNull();
  });
});
