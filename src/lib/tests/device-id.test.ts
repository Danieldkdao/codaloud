import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(async () => null),
  write: vi.fn(async () => {}),
  uuid: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
}));
vi.mock("expo-crypto", () => ({ randomUUID: mocks.uuid }));
vi.mock("expo-sqlite/kv-store", () => ({
  default: { getItem: mocks.read, setItem: mocks.write },
}));

import { getDeviceId } from "../device-id";

it("serializes simultaneous identity creation for the agent and terminal", async () => {
  const ids = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()]);
  expect(ids).toEqual(Array(3).fill("00000000-0000-4000-8000-000000000001"));
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.write).toHaveBeenCalledOnce();
  expect(mocks.uuid).toHaveBeenCalledOnce();
});
