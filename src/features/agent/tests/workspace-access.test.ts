import { expect, it, vi } from "vitest";
import { registerAgentMutation, runAgentMutation } from "../workspace-access";

it("runs mutations through the mounted workspace guard and releases only its owner", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const removeFirst = registerAgentMutation("project", async (action) => {
    first();
    return action();
  });
  const removeSecond = registerAgentMutation("project", async (action) => {
    second();
    return action();
  });
  removeFirst();
  expect(await runAgentMutation("project", async () => 42)).toBe(42);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  removeSecond();
  expect(await runAgentMutation("project", async () => 43)).toBe(43);
});
