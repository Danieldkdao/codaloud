import { Paths } from "expo-file-system";
import { z } from "zod";

import { projectFilePathSchema } from "../actions/file-schemas";
import { WORKSPACE_FOLDER_NAME } from "../constants";
import { projectPathSegments } from "./workspace-paths";

/** Images are decoded directly from the native engine's document directory. */
export const projectImageUri = (projectId: string, path: string) => {
  const id = z.uuid().parse(projectId).toLowerCase();
  projectFilePathSchema.parse(path);
  const segments = projectPathSegments(path).map((segment) =>
    encodeURIComponent(segment),
  );
  const directory = Paths.document.uri.replace(/\/$/, "");
  return `${directory}/${WORKSPACE_FOLDER_NAME}/${id}/${segments.join("/")}`;
};
