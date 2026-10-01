import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { startDevelopmentWithTunnel } from "../scripts/dev-with-tunnel.mjs";

vi.mock("../scripts/prepare-ios-native-assets.mjs", () => ({
  prepareIosNativeAssets: vi.fn(),
}));
const endpoint = "https://5jfkq6mx-8081.use.devtunnels.ms";
const setup = () => {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
  const spawnProcess = vi.fn().mockReturnValue(child);
  const signals = new EventEmitter() as unknown as NodeJS.Process;
  const options = {
    env: { ...process.env, DEV_TUNNEL_URL: `${endpoint}/` },
    spawnProcess,
    signals,
    portOccupied: vi.fn().mockResolvedValue(false),
    args: ["--ios", "Test iPhone"],
  };
  return { child, spawnProcess, signals, options };
};
it("uses the configured Dev Tunnel directly for authentication and APIs", async () => {
  const fixture = setup();
  const running = startDevelopmentWithTunnel(fixture.options);
  await vi.waitFor(() => expect(fixture.spawnProcess).toHaveBeenCalledOnce());
  expect(fixture.spawnProcess).toHaveBeenCalledWith(
    process.execPath,
    [
      "scripts/dev-with-voice.mjs",
      "--trigger-dev",
      "run:ios",
      "--device",
      "Test iPhone",
      "--port",
      "8081",
    ],
    expect.objectContaining({
      env: expect.objectContaining({
        BETTER_AUTH_URL: endpoint,
        EXPO_PUBLIC_BETTER_AUTH_URL: endpoint,
      }),
    }),
  );
  fixture.child.emit("exit", 0);
  expect(await running).toBe(0);
});
it("uses the same endpoint for normal development and Android", async () => {
  for (const [args, command] of [
    [[], ["start"]],
    [["--android"], ["run:android"]],
  ] as const) {
    const fixture = setup();
    const running = startDevelopmentWithTunnel({
      ...fixture.options,
      args: [...args],
    });
    await vi.waitFor(() => expect(fixture.spawnProcess).toHaveBeenCalledOnce());
    expect(fixture.spawnProcess.mock.calls[0]?.[1]).toEqual([
      "scripts/dev-with-voice.mjs",
      "--trigger-dev",
      ...command,
      "--port",
      "8081",
    ]);
    fixture.child.emit("exit", 0);
    await running;
  }
  const scripts = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).scripts;
  expect(scripts.dev).toContain("scripts/dev-with-tunnel.mjs");
  expect(scripts.ios).toContain("scripts/dev-with-tunnel.mjs --ios");
  expect(scripts.android).toContain("scripts/dev-with-tunnel.mjs --android");
});
it("requires a valid HTTPS endpoint before starting services", async () => {
  const fixture = setup();
  for (const url of [
    "",
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/api",
    "https://example.com/?token=secret",
  ]) {
    await expect(
      startDevelopmentWithTunnel({
        ...fixture.options,
        env: { ...process.env, DEV_TUNNEL_URL: url },
      }),
    ).rejects.toThrow("DEV_TUNNEL_URL");
  }
  expect(fixture.spawnProcess).not.toHaveBeenCalled();
});
it("stops before reusing old services or conflicting ports", async () => {
  for (const port of [8081, 8787, 8089]) {
    const fixture = setup();
    await expect(
      startDevelopmentWithTunnel({
        ...fixture.options,
        portOccupied: vi.fn((candidate) => candidate === port),
      }),
    ).rejects.toThrow(`port ${port}`);
  }
});
it("handles process failures and signals", async () => {
  const fixture = setup();
  const running = startDevelopmentWithTunnel(fixture.options);
  await vi.waitFor(() =>
    expect(fixture.signals.listenerCount("SIGINT")).toBe(1),
  );
  fixture.signals.emit("SIGINT");
  expect(fixture.child.kill).toHaveBeenCalledWith("SIGINT");
  fixture.child.emit("exit", null, "SIGINT");
  expect(await running).toBe(130);
  expect(fixture.signals.listenerCount("SIGINT")).toBe(0);
  const failed = setup();
  await expect(
    startDevelopmentWithTunnel({
      ...failed.options,
      spawnProcess: vi.fn(() => {
        throw new Error("cannot launch");
      }),
    }),
  ).rejects.toThrow("cannot launch");
});
it("keeps the separately forwarded terminal URL", async () => {
  const fixture = setup();
  const running = startDevelopmentWithTunnel({
    ...fixture.options,
    env: {
      ...fixture.options.env,
      TERMINAL_WS_URL: "wss://terminal.example.com/terminal",
    },
  });
  await vi.waitFor(() => expect(fixture.spawnProcess).toHaveBeenCalledOnce());
  expect(fixture.spawnProcess.mock.calls[0]?.[2]?.env?.TERMINAL_WS_URL).toBe(
    "wss://terminal.example.com/terminal",
  );
  fixture.child.emit("exit", 0);
  await running;
});
