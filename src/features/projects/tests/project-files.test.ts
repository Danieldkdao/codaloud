import type { FileInfo } from "@daytona/sdk";
import { expect, it } from "vitest";
import { getDirectoryFiles } from "@/features/projects/lib/files";

const entry = (path: string, isDir = false): FileInfo => ({
  path,
  name: path.replace(/\/$/, "").split("/").pop()!,
  isDir,
  size: 0,
  modifiedAt: "2026-09-08T15:30:00Z",
  modTime: "2026-09-08 15:30:00 +0000 UTC",
  mode: "0644",
  permissions: "rw-r--r--",
  owner: "daytona",
  group: "daytona",
});

it("only includes direct children of the requested directory", () => {
  const files = [
    entry("/workspace/project/app", true),
    entry("/workspace/project/app/page.tsx"),
    entry("/workspace/project/package.json"),
    entry("/workspace/project-other/readme.md"),
    entry("/workspace/project", true),
  ];
  expect(getDirectoryFiles(files, "/workspace/project").map((file) => file.name))
    .toEqual(["app", "package.json"]);
});

it("puts dot folders before other folders, then files, with natural alphabetical order", () => {
  const files = [
    entry("/project/zebra", true), entry("/project/file10.ts"),
    entry("/project/.vscode", true), entry("/project/file2.ts"),
    entry("/project/app", true), entry("/project/.github", true),
    entry("/project/.gitignore"),
  ];
  const original = [...files];
  expect(getDirectoryFiles(files, "/project").map((file) => file.name))
    .toEqual([".github", ".vscode", "app", "zebra", ".gitignore", "file2.ts", "file10.ts"]);
  expect(files).toEqual(original);
});

it("accepts trailing slashes without including grandchildren", () => {
  expect(getDirectoryFiles([
    entry("/project/app/", true), entry("/project/app/page.tsx"),
  ], "/project/").map((file) => file.name)).toEqual(["app"]);
});

it("returns an empty listing when there are no direct children", () => {
  expect(getDirectoryFiles([], "/project")).toEqual([]);
  expect(getDirectoryFiles([entry("/project/app/page.tsx")], "/project")).toEqual([]);
});
