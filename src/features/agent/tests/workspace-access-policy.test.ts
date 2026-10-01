import { expect, it } from "vitest";
import {
  assertWorkspaceToolAllowed,
  filterWorkspaceToolResult,
} from "../lib/workspace-access-policy";

const protectedPaths = [".env*", "node_modules", "private/config"];

it("blocks direct reads and writes to protected paths", () => {
  expect(() =>
    assertWorkspaceToolAllowed(
      "readFile",
      { path: "src/.env.local" },
      protectedPaths,
    ),
  ).toThrow(/disabled/i);
  expect(() =>
    assertWorkspaceToolAllowed(
      "createFile",
      { parentPath: "private", name: "config" },
      protectedPaths,
    ),
  ).toThrow(/disabled/i);
  expect(() =>
    assertWorkspaceToolAllowed(
      "renameFile",
      { parentPath: "src", previousName: "index.ts", name: ".env" },
      protectedPaths,
    ),
  ).toThrow(/disabled/i);
  expect(() =>
    assertWorkspaceToolAllowed(
      "editFile",
      { path: "src/index.ts" },
      protectedPaths,
    ),
  ).not.toThrow();
});

it("blocks AI shell and broad Git tools while protections are active", () => {
  expect(() =>
    assertWorkspaceToolAllowed(
      "runTerminalCommand",
      { command: "cat .env" },
      protectedPaths,
    ),
  ).toThrow(/disabled/i);
  expect(() =>
    assertWorkspaceToolAllowed("readTerminalOutput", {}, protectedPaths),
  ).toThrow(/disabled/i);
  expect(() =>
    assertWorkspaceToolAllowed("gitChanges", {}, protectedPaths),
  ).toThrow(/disabled/i);
});

it("filters protected paths from broad file listings and searches", () => {
  expect(
    filterWorkspaceToolResult(
      "listFiles",
      [{ path: "src/index.ts" }, { path: "src/.env.local" }],
      protectedPaths,
    ),
  ).toEqual([{ path: "src/index.ts" }]);
  expect(
    filterWorkspaceToolResult(
      "searchFiles",
      {
        files: [
          { path: "node_modules/pkg/index.ts" },
          { path: "src/index.ts" },
        ],
        nextCursor: null,
      },
      protectedPaths,
    ),
  ).toMatchObject({ files: [{ path: "src/index.ts" }] });
  expect(() =>
    assertWorkspaceToolAllowed(
      "listFiles",
      { path: "node_modules" },
      protectedPaths,
    ),
  ).toThrow(/disabled/i);
});
