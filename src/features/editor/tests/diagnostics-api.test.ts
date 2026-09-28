// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: mocks.getCurrentUser }));

const load = async () =>
  (await import("@/features/editor/server/diagnostics-api"))
    .handleDiagnosticsRequest;

const post = (body: unknown) =>
  new Request("https://codaloud.test/api/editor/diagnostics", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.getCurrentUser.mockReset().mockResolvedValue({ userId: "user-one" });
});

it("requires a signed-in user", async () => {
  mocks.getCurrentUser.mockResolvedValue({ userId: null });
  const response = await (await load())(post({ path: "a.py", content: "x = 1" }));

  expect(response.status).toBe(401);
});

it("rejects a request with no analyzable path", async () => {
  const response = await (await load())(post({ path: "", content: "x = 1" }));

  expect(response.status).toBe(400);
});

/**
 * These drive the real vendored runtimes, because a silent "unavailable" is the
 * failure the route exists to fix, and the project tree is the only asset source.
 */
it("reports a real python syntax error, including at the end of the file", async () => {
  const content = ["def ok(value):", "    return value", "", "", "if", "  ].broken("].join(
    "\n",
  );
  const response = await (await load())(post({ path: "app.py", content }));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.status).toBe("ready");
  expect(body.diagnostics.length).toBeGreaterThan(0);
  expect(body.diagnostics[0]).toMatchObject({ severity: "error" });
  expect(body.diagnostics[0].from).toBeGreaterThan(20);
});

it("distinguishes a clean file from an unavailable one", async () => {
  const response = await (await load())(
    post({ path: "app.py", content: "def ok(value):\n    return value + 1\n" }),
  );

  await expect(response.json()).resolves.toEqual({
    status: "ready",
    diagnostics: [],
  });
});

it("reports a real lint finding for shell through the same route", async () => {
  const response = await (await load())(post({ path: "deploy.sh", content: "echo $UNQUOTED\n" }));

  await expect(response.json()).resolves.toMatchObject({
    status: "ready",
    diagnostics: [expect.objectContaining({ code: "shellcheck:SC2086" })],
  });
});

/**
 * The first python read uses the fast grammar and later reads carry CPython's
 * message; this runs in the node environment so Pyodide's boot detection holds.
 */
it("upgrades python to CPython's own messages once the background boot finishes", async () => {
  const content = ["def ok(value):", "    return value", "", "if", "  ].broken("].join(
    "\n",
  );
  const handler = await load();
  const first = await (await handler(post({ path: "warm.py", content }))).json();

  expect(first.status).toBe("ready");
  expect(first.diagnostics.length).toBeGreaterThan(0);

  const { isPyodideRuntimeReady } = await import(
    "@/features/code-intelligence/parsers/python-analyzer"
  );
  await vi.waitFor(() => expect(isPyodideRuntimeReady()).toBe(true), {
    timeout: 50_000,
    interval: 100,
  });
  const warm = await (await handler(post({ path: "warm.py", content }))).json();

  expect(warm.diagnostics[0]).toMatchObject({
    source: "CPython",
    code: "python:syntax-error",
  });
}, 75_000);
