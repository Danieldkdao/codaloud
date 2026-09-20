import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("expo-sqlite/kv-store", () => ({ default: storage }));
import { readGitIdentity, requireGitIdentity, saveGitIdentity } from "../git-identity";

beforeEach(() => vi.resetAllMocks());

it("has no default or invented Git author on a fresh installation", async () => {
  storage.getItem.mockResolvedValue(null);
  expect(await readGitIdentity()).toBeNull();
  await expect(requireGitIdentity()).rejects.toThrow("Set your Git author");
  expect(storage.setItem).not.toHaveBeenCalled();
});

it("saves a validated author together and reads it without workspace setup", async () => {
  const identity = { name: "Daniel", email: "daniel@example.com" };
  expect(await saveGitIdentity({ ...identity, name: " Daniel " })).toEqual(identity);
  expect(storage.setItem).toHaveBeenCalledWith("git-identity", JSON.stringify(identity));
  storage.getItem.mockResolvedValue(JSON.stringify(identity));
  expect(await requireGitIdentity()).toEqual(identity);
});

it("rejects invalid authors before saving", async () => {
  await expect(saveGitIdentity({ name: "", email: "invalid" })).rejects.toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
});

it("returns null for malformed or unreadable saved author data", async () => {
  storage.getItem.mockResolvedValue("invalid json");
  expect(await readGitIdentity()).toBeNull();
  storage.getItem.mockResolvedValue(JSON.stringify({ name: "Daniel" }));
  expect(await readGitIdentity()).toBeNull();
  storage.getItem.mockRejectedValue(new Error("Unavailable"));
  expect(await readGitIdentity()).toBeNull();
});

it("does not report success when persisting the author fails", async () => {
  storage.setItem.mockRejectedValue(new Error("Full"));
  await expect(saveGitIdentity({ name: "Daniel", email: "daniel@example.com" })).rejects.toThrow("Full");
});
