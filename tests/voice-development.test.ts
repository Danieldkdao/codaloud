import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startVoiceDevelopment } from "../scripts/dev-with-voice.mjs";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
const child = () => Object.assign(new EventEmitter(), { kill: vi.fn() });
let worker: ReturnType<typeof child>;
let expo: ReturnType<typeof child>;
let stop: (() => void) | undefined;
const exit = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  worker = child();
  expo = child();
  mocks.spawn.mockReturnValueOnce(worker).mockReturnValueOnce(expo);
});
afterEach(() => {
  stop?.();
  worker.emit("exit", 0);
  expo.emit("exit", 0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("starts the named worker with its env and TypeScript loader alongside Expo", () => {
  stop = startVoiceDevelopment(exit);
  expect(mocks.spawn).toHaveBeenNthCalledWith(
    1,
    process.execPath,
    [
      "--env-file=.env",
      "--import",
      "tsx",
      "src/services/livekit/voice-worker.ts",
      "start",
    ],
    expect.objectContaining({ stdio: ["ignore", "inherit", "inherit"] }),
  );
  expect(mocks.spawn).toHaveBeenNthCalledWith(
    2,
    process.execPath,
    [expect.stringMatching(/expo\/bin\/cli$/), "start", "-c"],
    expect.objectContaining({ stdio: "inherit" }),
  );
});
it("stops Expo and exits unsuccessfully when the voice worker fails", () => {
  stop = startVoiceDevelopment(exit);
  worker.emit("exit", 1);
  expect(expo.kill).toHaveBeenCalledWith("SIGTERM");
  expect(exit).not.toHaveBeenCalled();
  expo.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});
it("cleans up the worker when Expo exits or cannot start", () => {
  stop = startVoiceDevelopment(exit);
  expo.emit("error", new Error("failed to spawn"));
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  worker.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});
it("bounds shutdown even when a child does not respond", async () => {
  stop = startVoiceDevelopment(exit);
  stop();
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  expect(expo.kill).toHaveBeenCalledWith("SIGTERM");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(worker.kill).toHaveBeenCalledWith("SIGKILL");
  expect(expo.kill).toHaveBeenCalledWith("SIGKILL");
  expect(exit).toHaveBeenCalledOnce();
});
