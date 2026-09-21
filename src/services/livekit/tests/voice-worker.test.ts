import { expect, it, vi } from "vitest";
import { ServerOptions } from "@livekit/agents";
import "../voice-worker";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@livekit/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@livekit/agents")>();
  return { ...actual, cli: { runApp: mocks.run } };
});
vi.mock("@/data/env/server", () => ({
  serverEnv: {
    LIVEKIT_URL: "wss://example.test",
    LIVEKIT_API_KEY: "offline-test",
    LIVEKIT_API_SECRET: "offline-test",
  },
}));

const configured = mocks.run.mock.calls[0]![0] as ServerOptions;

it("keeps the worker health server off Metro's port after CLI start resolves production defaults", () => {
  // runServer reconstructs the options with production=true for `start`.
  // Test the actual SDK resolution: port 0 is replaced by 8081 in Agents 1.9.
  const resolved = new ServerOptions({ ...configured, production: true });
  expect(resolved.port).not.toBe(8081);
  expect(resolved.port).toBeGreaterThan(0);
  expect(resolved.agentName).toBe("codaloud-voice");
});
