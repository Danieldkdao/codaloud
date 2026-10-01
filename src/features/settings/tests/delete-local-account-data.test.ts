import { beforeEach, expect, it, vi } from "vitest";
import { deleteLocalAccountData } from "../delete-local-account-data";

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  deleteItemAsync: vi.fn(),
  disconnectGitHub: vi.fn(),
  migrate: vi.fn(),
  deleteRow: vi.fn(),
  directories: new Map<string, { exists: boolean; delete: () => void }>(),
}));

vi.mock("@/db/local/db", () => ({
  db: { delete: () => ({ run: mocks.deleteRow }) },
}));
vi.mock("@/db/local/migrate", () => ({
  migrateDatabase: mocks.migrate,
}));
vi.mock("@/db/local/schemas/draft", () => ({ DraftTable: {} }));
vi.mock("@/db/local/schemas/project", () => ({ ProjectTable: {} }));
vi.mock("expo-sqlite/kv-store", () => ({
  default: { clear: mocks.clear },
}));
vi.mock("expo-secure-store", () => ({
  deleteItemAsync: mocks.deleteItemAsync,
}));
vi.mock("@/services/github/credentials", () => ({
  disconnectGitHub: mocks.disconnectGitHub,
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "documents", cache: "cache" },
  Directory: class {
    key: string;
    constructor(...parts: string[]) {
      this.key = parts.join("/");
    }
    get exists() {
      return mocks.directories.get(this.key)?.exists ?? false;
    }
    delete() {
      mocks.directories.get(this.key)?.delete();
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.directories.clear();
  for (const path of [
    "documents/codaloud-workspaces",
    "documents/codaloud-draft-assets",
    "cache/explanations",
  ])
    mocks.directories.set(path, { exists: true, delete: vi.fn() });
});

it("removes workspace files, local records, preferences, and local credentials", async () => {
  await deleteLocalAccountData();
  expect(mocks.migrate).toHaveBeenCalledOnce();
  expect(mocks.deleteRow).toHaveBeenCalledTimes(2);
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.disconnectGitHub).toHaveBeenCalledOnce();
  expect(mocks.deleteItemAsync).toHaveBeenCalledWith("codaloud.theme");
  expect(mocks.deleteItemAsync).toHaveBeenCalledWith("codaloud_cookie");
  expect(mocks.deleteItemAsync).toHaveBeenCalledWith("codaloud_session_data");
  for (const directory of mocks.directories.values())
    expect(directory.delete).toHaveBeenCalledOnce();
});
