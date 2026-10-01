import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  action: vi.fn(),
  read: vi.fn(),
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: async () => "cookie" },
}));
vi.mock("@/lib/utils", () => ({ fetchBase: mocks.fetch }));
vi.mock("../command-actions", () => ({ executeCommandAction: mocks.action }));
vi.mock("../voice-workspace", () => ({
  getVoiceContext: (request: {
    id: string;
    projectId: string;
    mode: string;
  }) => ({
    id: request.id,
    projectId: request.projectId,
    mode: request.mode,
    branch: "",
    activeFile: null,
    openFiles: [],
    openFilesTruncated: false,
  }),
  readVoiceWorkspace: mocks.read,
}));
import { sendTextCommand } from "../text-command";
import { commandCenter } from "../command-center";
import { inlineSession } from "../inline-session";
const nativeRequire = createRequire(
  import.meta.resolve("react-native/package.json"),
);
const { AbortController: NativeAbortController } = nativeRequire(
  "abort-controller",
) as { AbortController: typeof AbortController };
beforeEach(() => {
  vi.stubGlobal("AbortController", NativeAbortController);
  vi.resetAllMocks();
  commandCenter.clear();
  inlineSession.cancel();
});
afterEach(() => {
  commandCenter.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const respond = (text: string, toolCalls: unknown[] = []) =>
  new Response(JSON.stringify({ text, messages: [], toolCalls }));
it("uses text HTTP turns and executes a tool once before displaying the final reply", async () => {
  mocks.fetch
    .mockResolvedValueOnce(
      respond("", [
        {
          toolName: "navigate",
          toolCallId: "call",
          input: { target: "files" },
        },
      ]),
    )
    .mockResolvedValueOnce(respond("Files are open."));
  mocks.action.mockResolvedValue({ ok: true });
  await sendTextCommand("p", "Show matching files", "agent");
  expect(mocks.action).toHaveBeenCalledOnce();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(
    mocks.fetch.mock.calls.every(([path]) => path === "/api/voice/text"),
  ).toBe(true);
  expect(commandCenter.getSnapshot().transcript.at(-1)?.text).toBe(
    "Files are open.",
  );
  expect(commandCenter.getSnapshot().busy).toBe(false);
});
it("cancels before a delayed model response can execute a tool", async () => {
  let resolve!: (response: Response) => void;
  mocks.fetch.mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const run = sendTextCommand("p", "Show matching files", "agent");
  await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
  commandCenter.clear();
  resolve(
    respond("", [
      { toolName: "navigate", toolCallId: "call", input: { target: "files" } },
    ]),
  );
  await run;
  expect(mocks.action).not.toHaveBeenCalled();
  expect(commandCenter.getSnapshot().transcript).toEqual([]);
});
it("executes an exact navigation shortcut on device with zero inference requests", async () => {
  mocks.action.mockResolvedValue({ ok: true });
  await sendTextCommand("p", "Open files", "agent");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.action).toHaveBeenCalledWith(
    "p",
    expect.objectContaining({ name: "navigate", args: { target: "files" } }),
  );
  expect(commandCenter.getSnapshot().transcript.at(-1)?.text).toMatch(/files/i);
});
it("opens a panel without waiting for editor capture or a busy workspace", async () => {
  const capture = vi.fn(async () => {
    throw new Error("Workspace busy");
  });
  const release = inlineSession.register("p", {
    capture,
    preview: vi.fn(),
    apply: vi.fn(),
  });
  mocks.action.mockResolvedValue({ ok: true });
  await sendTextCommand("p", "Open files", "agent");
  expect(mocks.action).toHaveBeenCalledOnce();
  expect(capture).not.toHaveBeenCalled();
  expect(commandCenter.getSnapshot().error).toBeNull();
  release();
});
it("reports transport failure without inventing success or retrying mutations", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("development API unavailable"));
  await sendTextCommand("p", "Commit changes", "agent");
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.action).not.toHaveBeenCalled();
  expect(commandCenter.getSnapshot().error).toMatch(/development API/);
});
it("rejects a model call identity reused for a different action instead of reporting stale success", async () => {
  mocks.fetch
    .mockResolvedValueOnce(
      respond("", [
        {
          toolName: "navigate",
          toolCallId: "same",
          input: { target: "files" },
        },
      ]),
    )
    .mockResolvedValueOnce(
      respond("", [
        { toolName: "navigate", toolCallId: "same", input: { target: "git" } },
      ]),
    )
    .mockResolvedValueOnce(respond("Done"));
  mocks.action.mockResolvedValue({ ok: true });
  await sendTextCommand("p", "Show my files then Git", "agent");
  expect(mocks.action).toHaveBeenCalledOnce();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(commandCenter.getSnapshot().error).toMatch(/reused/);
});
it("releases a timed out text request without stopping a newer request", async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  mocks.fetch.mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const run = sendTextCommand("p", "List files", "agent");
  for (let index = 0; index < 10; index++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(240000);
  resolve(respond("Late reply"));
  await run;
  expect(commandCenter.getSnapshot().busy).toBe(false);
  expect(commandCenter.getSnapshot().error).toMatch(/timed out/);
  vi.useRealTimers();
});
