import { pathMatchesRule } from "@/features/settings/lib/path-rules";
import type { WorkspaceToolName } from "../tools/workspace-tools";

const blockedMessage =
  "This AI action is disabled by Editor Settings → Disabled Files / Folders.";

const pathOf = (input: Record<string, unknown>) =>
  typeof input.path === "string" ? input.path : "";

const entryPath = (input: Record<string, unknown>, name: string) => {
  const parent = typeof input.parentPath === "string" ? input.parentPath : "";
  return parent ? `${parent}/${name}` : name;
};

export const assertWorkspaceToolAllowed = (
  name: WorkspaceToolName,
  args: unknown,
  disabledPaths: readonly string[],
) => {
  if (!disabledPaths.length) return;
  const input =
    args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  let paths: string[];
  switch (name) {
    case "readFile":
    case "saveFile":
    case "editFile":
      paths = [pathOf(input)];
      break;
    case "listFiles":
    case "searchFiles":
      paths = [pathOf(input)];
      break;
    case "createFile":
    case "deleteFile":
    case "renameFile": {
      if (input.kind === "folder" && name !== "createFile")
        throw new Error(blockedMessage);
      const target = typeof input.name === "string" ? input.name : "";
      paths = [entryPath(input, target)];
      if (name === "renameFile" && typeof input.previousName === "string")
        paths.push(entryPath(input, input.previousName));
      break;
    }
    default:
      // Terminal output and Git diffs can expose private content. Broad Git
      // mutations can also change protected files without naming them.
      throw new Error(blockedMessage);
  }
  if (paths.some((path) => path && pathMatchesRule(path, disabledPaths)))
    throw new Error(blockedMessage);
};

export const filterWorkspaceToolResult = (
  name: WorkspaceToolName,
  result: unknown,
  disabledPaths: readonly string[],
): unknown => {
  if (!disabledPaths.length) return result;
  const visible = (value: unknown) =>
    value &&
    typeof value === "object" &&
    "path" in value &&
    typeof value.path === "string" &&
    !pathMatchesRule(value.path, disabledPaths);
  if (name === "listFiles" && Array.isArray(result))
    return result.filter(visible);
  if (
    name === "searchFiles" &&
    result &&
    typeof result === "object" &&
    "files" in result &&
    Array.isArray(result.files)
  )
    return { ...result, files: result.files.filter(visible) };
  return result;
};
