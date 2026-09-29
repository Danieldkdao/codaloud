import { z } from "zod";

import { Directory, File, Paths } from "expo-file-system";
import { WORKSPACE_FOLDER_NAME } from "../constants";
import {
  projectDirectoryPathSchema,
  projectFileNameSchema,
} from "../actions/file-schemas";

/**
 * The native engine roots every project at `<documents>/codaloud-workspaces/<id>`.
 * Uploads need the same address to place files a project can already see, so this
 * is the one place that maps a project-relative path onto that directory.
 */
const workspaceSegment = (projectId: string) =>
  z.uuid().parse(projectId).toLowerCase();

export const projectPathSegments = (relativePath: string) => {
  projectDirectoryPathSchema.parse(relativePath);
  const segments = relativePath === "" ? [] : relativePath.split("/");
  for (const segment of segments) {
    projectFileNameSchema.parse(segment);
    // The engine refuses to walk through .git, so writes must not target it either.
    if (segment.toLowerCase() === ".git")
      throw new Error("This folder belongs to Git and cannot be written to.");
  }
  return segments;
};

export const projectWorkspaceDirectory = (projectId: string) =>
  new Directory(Paths.document, WORKSPACE_FOLDER_NAME, workspaceSegment(projectId));

export const projectWorkspaceFile = (projectId: string, relativePath: string) =>
  new File(
    projectWorkspaceDirectory(projectId),
    ...projectPathSegments(relativePath),
  );

export const joinProjectPath = (directoryPath: string, name: string) =>
  directoryPath === "" ? name : `${directoryPath}/${name}`;

/**
 * A workspace the engine has not created (or that the folders disagree about)
 * must fail loudly instead of writing into a directory nothing reads back.
 */
export const requireProjectWorkspace = (projectId: string) => {
  const directory = projectWorkspaceDirectory(projectId);
  if (!directory.exists)
    throw new Error(
      "This project's folder is not available on this device yet. Open the project once, then try again.",
    );
  return directory;
};
