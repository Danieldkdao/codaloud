import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createProjectAction } from "@/features/projects/actions/actions";
import type { CreateProjectFormSchema } from "@/features/projects/actions/schemas";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCookie: vi.fn(),
  platform: { OS: "ios" },
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getSession: mocks.getSession, getCookie: mocks.getCookie },
}));
vi.mock("@/lib/auth/utils", () => ({
  getBaseURL: () => "https://api.codaloud.test/",
}));
vi.mock("react-native", () => ({ Platform: mocks.platform, Alert: { alert: vi.fn() } }));

const network = vi.fn<typeof fetch>();
const validData: CreateProjectFormSchema = { name: " My project ", source: "new" };
const successBody = { error: false, message: "Project created successfully.", data: { id: "created-project" } };

beforeEach(() => {
  mocks.platform.OS = "ios";
  mocks.getSession.mockResolvedValue({ data: { user: { id: "current-user" } }, error: null });
  mocks.getCookie.mockResolvedValue("session=mobile");
  network.mockReset();
  network.mockImplementation(async () => Response.json(successBody, { status: 201 }));
  vi.stubGlobal("fetch", network);
});

describe("createProjectAction", () => {
  it.each([null, { user: { id: "" } }])("returns a sign-in error for session %o before validating input", async (data) => {
    mocks.getSession.mockResolvedValue({ data, error: null });
    expect(await createProjectAction({ name: "", source: "new" })).toEqual({
      error: true, message: "You must be signed in to create a project.",
    });
    expect(network).not.toHaveBeenCalled();
  });

  it("returns an error when session lookup fails", async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: { message: "Private auth details" } });
    expect(await createProjectAction(validData)).toEqual({
      error: true, message: "Unable to verify your session. Please try again.",
    });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: " ", source: "new" }, "Project name is required."],
    [{ name: " ", source: "github", repositoryId: "123" }, "Project name is required."],
    [{ name: "My project", source: "github" }, "Select a GitHub repository."],
    [{ name: "My project", source: "other" }, "Choose how to start your project."],
  ])("validates unsafe data before posting: %o", async (data, message) => {
    expect(await createProjectAction(data as CreateProjectFormSchema)).toEqual({ error: true, message });
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
  });

  it.each<CreateProjectFormSchema>([
    { name: " My project ", source: "new" },
    { name: " My project ", source: "github", repositoryId: "123" },
  ])("posts validated $source data and returns the project ID", async (data) => {
    expect(await createProjectAction(data)).toEqual({
      error: false, message: successBody.message, projectId: "created-project",
    });
    expect(network).toHaveBeenCalledOnce();
    const [url, options] = network.mock.calls[0];
    expect(url).toBe("https://api.codaloud.test/api/projects");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(options?.body))).toEqual({ ...data, name: "My project" });
  });

  it.each(["ios", "android"])("uses the correct session transport on %s", async (os) => {
    mocks.platform.OS = os;
    await createProjectAction(validData);
    const [url, options] = network.mock.calls[0];
    expect(url).toBe("https://api.codaloud.test/api/projects");
    expect(options?.credentials).toBe("omit");
    expect(new Headers(options?.headers).get("Cookie")).toBe("session=mobile");
  });

  it.each([200, 400, 401, 500])("returns an API error message for status %s", async (status) => {
    network.mockResolvedValue(Response.json({ error: true, message: "Unable to create this project." }, { status }));
    expect(await createProjectAction(validData)).toEqual({ error: true, message: "Unable to create this project." });
  });

  it("does not report success for a failed HTTP request", async () => {
    network.mockResolvedValue(Response.json(successBody, { status: 500 }));
    expect(await createProjectAction(validData)).toEqual({
      error: true, message: "Unable to create project. Please try again.",
    });
  });

  it.each([
    null, {}, { error: false, message: "Created" },
    { error: false, message: "Created", data: { id: "" } },
    { error: false, message: "Created", data: { id: 123 } },
    { error: "false", message: "Created", data: { id: "project" } },
  ])("rejects a malformed response %o", async (body) => {
    network.mockResolvedValue(Response.json(body));
    expect(await createProjectAction(validData)).toEqual({
      error: true, message: "The server returned an invalid project response.",
    });
  });

  it("returns an error when the response is not JSON", async () => {
    network.mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    expect(await createProjectAction(validData)).toMatchObject({ error: true, message: expect.any(String) });
  });

  it.each(["session", "cookie", "request"])("returns an error instead of throwing when %s fails", async (stage) => {
    const error = new Error("Private internal details");
    if (stage === "session") mocks.getSession.mockRejectedValue(error);
    if (stage === "cookie") {
      mocks.platform.OS = "ios";
      mocks.getCookie.mockRejectedValue(error);
    }
    if (stage === "request") network.mockRejectedValue(error);
    expect(await createProjectAction(validData)).toEqual({
      error: true, message: "Unable to create project. Please try again.",
    });
  });

  it("narrows the return type using error and requires an ID on success", () => {
    type Result = Awaited<ReturnType<typeof createProjectAction>>;
    expectTypeOf<Extract<Result, { error: false }>>().toMatchObjectType<{ error: false; message: string; projectId: string }>();
    expectTypeOf<Extract<Result, { error: true }>>().toMatchObjectType<{ error: true; message: string }>();
  });
});


it("preserves the reconnect-required response when credentials expire during submission", async () => {
  network.mockResolvedValue(Response.json({ error: true, message: "Reconnect GitHub to access your repositories.", code: "GITHUB_RECONNECT_REQUIRED" }, { status: 403 }));
  expect(await createProjectAction({ name: "Import", source: "github", repositoryId: "123" })).toEqual({
    error: true, message: "Reconnect GitHub to access your repositories.", code: "GITHUB_RECONNECT_REQUIRED",
  });
});
