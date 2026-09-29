import Storage from "expo-sqlite/kv-store";
import type { ProjectOpenFilesState } from "../types";

const keyFor = (projectId: string) => `project-open-tabs:${projectId}`;
const empty = (): ProjectOpenFilesState => ({
  openFilePaths: new Set(),
  activeFilePath: null,
  versions: new Map(),
});
const safePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 1024 &&
  !value.includes("\\") &&
  value
    .split("/")
    .every(
      (part) =>
        part !== "" && part !== "." && part !== ".." && !part.includes("\0"),
    );

export const loadOpenTabs = (projectId: string): ProjectOpenFilesState => {
  try {
    const raw = Storage.getItemSync(keyFor(projectId));
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty();
    const saved = parsed as { paths?: unknown; active?: unknown };
    if (!Array.isArray(saved.paths)) return empty();
    const paths = [...new Set(saved.paths.filter(safePath))].slice(0, 50);
    return {
      openFilePaths: new Set(paths),
      activeFilePath:
        safePath(saved.active) && paths.includes(saved.active)
          ? saved.active
          : (paths.at(-1) ?? null),
      versions: new Map(),
    };
  } catch {
    return empty();
  }
};

export const saveOpenTabs = (
  projectId: string,
  state: ProjectOpenFilesState,
) => {
  try {
    Storage.setItemSync(
      keyFor(projectId),
      JSON.stringify({
        paths: [...state.openFilePaths],
        active: state.activeFilePath,
      }),
    );
  } catch {
    // A storage failure must not prevent opening or closing an editor tab.
  }
};
