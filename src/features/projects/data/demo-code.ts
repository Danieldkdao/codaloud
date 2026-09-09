export const demoCodeFilename = "workspace.ts";

export const demoCode = `/**
 * A little room to build something great.
 * Explore, fold a function, or make an edit.
 */

type FileKind = "file" | "directory";

interface WorkspaceEntry {
  name: string;
  path: string;
  kind: FileKind;
  size: number;
}

interface Workspace {
  id: string;
  name: string;
  root: string;
  entries: WorkspaceEntry[];
}

const workspace: Workspace = {
  id: "my-first-project",
  name: "My First Project",
  root: "/workspace/project",
  entries: [
    { name: "app", path: "/workspace/project/app", kind: "directory", size: 0 },
    { name: "components", path: "/workspace/project/components", kind: "directory", size: 0 },
    { name: "page.tsx", path: "/workspace/project/app/page.tsx", kind: "file", size: 1280 },
    { name: "utils.ts", path: "/workspace/project/lib/utils.ts", kind: "file", size: 640 },
  ],
};

const getDirectoryEntries = (
  entries: WorkspaceEntry[],
  directory: string,
): WorkspaceEntry[] => {
  const prefix = directory + "/";

  return entries
    .filter((entry) => {
      const relativePath = entry.path.slice(prefix.length);
      return entry.path.startsWith(prefix) && !relativePath.includes("/");
    })
    .sort((first, second) => {
      if (first.kind !== second.kind) {
        return first.kind === "directory" ? -1 : 1;
      }

      return first.name.localeCompare(second.name);
    });
};

const describeWorkspace = ({ name, entries }: Workspace): string => {
  const files = entries.filter((entry) => entry.kind === "file");
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  return name + " contains " + files.length + " files using " + totalBytes + " bytes.";
};

const findEntry = (path: string): WorkspaceEntry | undefined => {
  return workspace.entries.find((entry) => entry.path === path);
};

const rootEntries = getDirectoryEntries(workspace.entries, workspace.root);
const summary = describeWorkspace(workspace);

console.log(summary);
console.table(rootEntries);

export { workspace, getDirectoryEntries, describeWorkspace, findEntry };
`;
