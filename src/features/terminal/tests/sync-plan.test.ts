import { describe, expect, it } from "vitest";
import { isSyncablePath, planWorkspaceSync } from "../lib/sync-plan";

describe("workspace sync planning", () => {
  it("transfers only changed files and records matching content", () => {
    expect(
      planWorkspaceSync(
        { "main.py": "b", "new.ts": "n" },
        { "main.py": "b", "remote.txt": "r" },
        { "main.py": "b" },
      ),
    ).toEqual({
      upload: ["new.ts"],
      download: ["remote.txt"],
      deleteLocal: [],
      deleteRemote: [],
      conflicts: [],
    });
  });

  it("keeps simultaneous changes and deletions as conflicts", () => {
    expect(
      planWorkspaceSync(
        { "both.ts": "local", "removed.py": "old" },
        { "both.ts": "remote", "deleted-here.ts": "old" },
        {
          "both.ts": "base",
          "removed.py": "old",
          "deleted-here.ts": "old",
        },
      ),
    ).toEqual({
      upload: [],
      download: [],
      deleteLocal: ["removed.py"],
      deleteRemote: ["deleted-here.ts"],
      conflicts: ["both.ts"],
    });
  });

  it("does not erase an independently edited copy after a deletion", () => {
    expect(
      planWorkspaceSync(
        {},
        { "changed.ts": "remote" },
        { "changed.ts": "base" },
      ).conflicts,
    ).toEqual(["changed.ts"]);
  });

  it("downloads a sandbox edit over an unchanged local file", () => {
    expect(
      planWorkspaceSync(
        { "package.json": "base" },
        { "package.json": "installed" },
        { "package.json": "base" },
      ).download,
    ).toEqual(["package.json"]);
  });

  it("omits generated, git, and dependency folders from synchronization", () => {
    expect(isSyncablePath("src/file.ts")).toBe(true);
    for (const path of [
      ".git/config",
      "node_modules/pkg/index.js",
      ".expo/state.json",
      "dist/build.js",
      "src/../secret",
      "/root/file",
    ])
      expect(isSyncablePath(path)).toBe(false);
  });
  it("includes only selected excluded folders when large syncing is enabled", () => {
    expect(
      isSyncablePath("node_modules/pkg/index.d.ts", ["node_modules"]),
    ).toBe(true);
    expect(
      isSyncablePath("packages/app/node_modules/pkg/index.d.ts", [
        "node_modules",
      ]),
    ).toBe(true);
    expect(isSyncablePath(".git/config", ["node_modules"])).toBe(false);
    expect(isSyncablePath("../secret", ["node_modules", ".git"])).toBe(false);
    expect(
      planWorkspaceSync({}, { "node_modules/pkg/index.d.ts": "hash" }, {}, [
        "node_modules",
      ]).download,
    ).toEqual(["node_modules/pkg/index.d.ts"]);
  });
  it("never syncs Git metadata even when selected", () => {
    expect(isSyncablePath(".git/config", [".git"])).toBe(false);
    expect(isSyncablePath("packages/app/.git/HEAD", [".git"])).toBe(false);
  });
});
