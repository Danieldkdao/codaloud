import { isProjectFilePathWithin } from "./files";
import type { ProjectOpenFilesState } from "../types";

export const openWorkspaceFile = (state: ProjectOpenFilesState, path: string): ProjectOpenFilesState => ({
  ...state,
  openFilePaths: state.openFilePaths.includes(path) ? state.openFilePaths : [...state.openFilePaths, path],
  activeFilePath: path,
});

export const removeWorkspaceFiles = (state: ProjectOpenFilesState, paths: string[]): ProjectOpenFilesState => {
  const removed = new Set(paths);
  const openFilePaths = state.openFilePaths.filter((path) => !removed.has(path));
  const activeIndex = state.openFilePaths.indexOf(state.activeFilePath ?? "");
  return {
    ...state,
    openFilePaths,
    activeFilePath: state.activeFilePath && removed.has(state.activeFilePath)
      ? openFilePaths[Math.min(activeIndex, openFilePaths.length - 1)] ?? null
      : state.activeFilePath,
    // Reopening the same path must not resurrect an old editor/undo history.
    versions: { ...state.versions, ...Object.fromEntries(paths.map((path) => [path, (state.versions[path] ?? 0) + 1])) },
  };
};

export const renameWorkspaceFiles = (state: ProjectOpenFilesState, previousPath: string, nextPath: string): ProjectOpenFilesState => {
  const rename = (path: string) => isProjectFilePathWithin(path, previousPath) ? nextPath + path.slice(previousPath.length) : path;
  const versions = { ...state.versions };
  for (const path of state.openFilePaths) {
    const destination = rename(path);
    if (destination !== path) {
      versions[destination] = versions[path] ?? 0;
      versions[path] = (versions[path] ?? 0) + 1;
    }
  }
  return {
    openFilePaths: [...new Set(state.openFilePaths.map(rename))],
    activeFilePath: state.activeFilePath ? rename(state.activeFilePath) : null,
    versions,
  };
};
