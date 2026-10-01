import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startVoiceDevelopment } from "../scripts/dev-with-voice.mjs";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
const child = () => Object.assign(new EventEmitter(), { kill: vi.fn() });
let worker: ReturnType<typeof child>;
let gateway: ReturnType<typeof child>;
let expo: ReturnType<typeof child>;
let stop: (() => void) | undefined;
const exit = vi.fn();
const scripts = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).scripts as Record<string, string>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.spawn.mockReset();
  stop = undefined;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  worker = child();
  gateway = child();
  expo = child();
  mocks.spawn
    .mockReturnValueOnce(worker)
    .mockReturnValueOnce(gateway)
    .mockReturnValueOnce(expo);
});
afterEach(() => {
  stop?.();
  worker.emit("exit", 0);
  gateway.emit("exit", 0);
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
      "dev",
    ],
    expect.objectContaining({ stdio: ["ignore", "inherit", "inherit"] }),
  );
  expect(mocks.spawn).toHaveBeenNthCalledWith(
    2,
    process.execPath,
    expect.arrayContaining(["src/services/daytona/terminal-gateway.ts"]),
    expect.objectContaining({ stdio: ["ignore", "inherit", "inherit"] }),
  );
  expect(mocks.spawn).toHaveBeenNthCalledWith(
    3,
    process.execPath,
    [expect.stringMatching(/expo\/bin\/cli$/), "start", "-c"],
    expect.objectContaining({ stdio: "inherit" }),
  );
});

it.each([["android", "run:android"]])(
  "forwards the native %s command from the tunnel launcher",
  (platform, ...args) => {
    expect(scripts[platform]).toBe(
      `node --env-file=.env scripts/dev-with-tunnel.mjs --${platform}`,
    );
    stop = startVoiceDevelopment(exit, args);
    expect(mocks.spawn).toHaveBeenNthCalledWith(
      1,
      process.execPath,
      expect.arrayContaining(["src/services/livekit/voice-worker.ts", "dev"]),
      expect.any(Object),
    );
    expect(mocks.spawn).toHaveBeenNthCalledWith(
      2,
      process.execPath,
      expect.arrayContaining(["src/services/daytona/terminal-gateway.ts"]),
      expect.any(Object),
    );
    expect(mocks.spawn).toHaveBeenNthCalledWith(
      3,
      process.execPath,
      [expect.stringMatching(/expo\/bin\/cli$/), ...args],
      expect.objectContaining({ stdio: "inherit" }),
    );
  },
);

it("forwards iOS device and build flags to Expo without passing them to the worker", () => {
  stop = startVoiceDevelopment(exit, [
    "run:ios",
    "--device",
    "Test iPhone",
    "--no-build-cache",
  ]);
  expect(mocks.spawn.mock.calls[2][1]).toEqual([
    expect.stringMatching(/expo\/bin\/cli$/),
    "run:ios",
    "--device",
    "Test iPhone",
    "--no-build-cache",
  ]);
  expect(mocks.spawn.mock.calls[0][1]).not.toContain("--device");
});

it("starts and stops the installed Trigger.dev CLI with the iOS services", () => {
  const trigger = child();
  mocks.spawn
    .mockReset()
    .mockReturnValueOnce(worker)
    .mockReturnValueOnce(gateway)
    .mockReturnValueOnce(trigger)
    .mockReturnValueOnce(expo);
  stop = startVoiceDevelopment(exit, [
    "--trigger-dev",
    "run:ios",
    "--device",
    "Test iPhone",
  ]);
  expect(mocks.spawn).toHaveBeenNthCalledWith(
    3,
    process.execPath,
    [expect.stringMatching(/trigger\.dev\/dist\/esm\/index\.js$/), "dev"],
    expect.objectContaining({ stdio: "inherit" }),
  );
  expect(mocks.spawn.mock.calls[3][1]).toEqual([
    expect.stringMatching(/expo\/bin\/cli$/),
    "run:ios",
    "--device",
    "Test iPhone",
  ]);
  stop();
  expect(trigger.kill).toHaveBeenCalledWith("SIGTERM");
  trigger.emit("exit", 0);
});

it("stops the iOS services when Trigger.dev exits unexpectedly", () => {
  const trigger = child();
  mocks.spawn
    .mockReset()
    .mockReturnValueOnce(worker)
    .mockReturnValueOnce(gateway)
    .mockReturnValueOnce(trigger)
    .mockReturnValueOnce(expo);
  stop = startVoiceDevelopment(exit, ["--trigger-dev", "run:ios"]);
  trigger.emit("exit", 1);
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  expect(gateway.kill).toHaveBeenCalledWith("SIGTERM");
  expect(expo.kill).toHaveBeenCalledWith("SIGTERM");
  worker.emit("exit", 0);
  gateway.emit("exit", 0);
  expo.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("stops its worker when the native build fails", () => {
  stop = startVoiceDevelopment(exit, ["run:ios", "--device"]);
  expo.emit("exit", 65);
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  expect(gateway.kill).toHaveBeenCalledWith("SIGTERM");
  worker.emit("exit", 0);
  gateway.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(65);
});

it("keeps voice running when a successful native build reuses an existing Metro server", () => {
  stop = startVoiceDevelopment(exit, ["run:ios", "--device"]);
  expo.emit("exit", 0);
  expect(worker.kill).not.toHaveBeenCalled();
  expect(gateway.kill).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  stop();
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  expect(gateway.kill).toHaveBeenCalledWith("SIGTERM");
  worker.emit("exit", 0);
  gateway.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(0);
});

it("still stops the worker when the managed Metro server exits normally", () => {
  stop = startVoiceDevelopment(exit);
  expo.emit("exit", 0);
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  expect(gateway.kill).toHaveBeenCalledWith("SIGTERM");
  worker.emit("exit", 0);
  gateway.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(0);
});
it("stops Expo and exits unsuccessfully when the voice worker fails", () => {
  stop = startVoiceDevelopment(exit);
  worker.emit("exit", 1);
  expect(expo.kill).toHaveBeenCalledWith("SIGTERM");
  expect(gateway.kill).toHaveBeenCalledWith("SIGTERM");
  expect(exit).not.toHaveBeenCalled();
  gateway.emit("exit", 0);
  expo.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});
it("cleans up the worker when Expo exits or cannot start", () => {
  stop = startVoiceDevelopment(exit);
  expo.emit("error", new Error("failed to spawn"));
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  expect(gateway.kill).toHaveBeenCalledWith("SIGTERM");
  worker.emit("exit", 0);
  gateway.emit("exit", 0);
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});
it("bounds shutdown even when a child does not respond", async () => {
  stop = startVoiceDevelopment(exit);
  stop();
  expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
  expect(gateway.kill).toHaveBeenCalledWith("SIGTERM");
  expect(expo.kill).toHaveBeenCalledWith("SIGTERM");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(worker.kill).toHaveBeenCalledWith("SIGKILL");
  expect(gateway.kill).toHaveBeenCalledWith("SIGKILL");
  expect(expo.kill).toHaveBeenCalledWith("SIGKILL");
  expect(exit).toHaveBeenCalledOnce();
});

it("accepts an explicit start command without treating start as a project directory", () => {
  stop = startVoiceDevelopment(exit, ["start", "--port", "8081"]);
  expect(mocks.spawn.mock.calls[2][1]).toEqual([
    expect.stringMatching(/expo\/bin\/cli$/),
    "start",
    "-c",
    "--port",
    "8081",
  ]);
});
