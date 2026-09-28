import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";
import type {
  AgentCommandSchema,
  AgentToolResultSchema,
  FileActivitySchema,
} from "./schemas";

export const mergeFileActivity = (
  files: FileActivitySchema[],
  next: FileActivitySchema,
) => {
  const existing = files.find((file) => file.path === next.path);
  if (existing?.status === "changed" && next.status !== "changed") return files;
  return [...files.filter((file) => file.path !== next.path), next].slice(-100);
};

export const updateFileActivity = (
  files: FileActivitySchema[],
  command: AgentCommandSchema,
  result?: AgentToolResultSchema,
) => {
  let path: unknown = command.args.path;
  const edit = [
    "saveFile",
    "editFile",
    "createFile",
    "renameFile",
    "deleteFile",
  ].includes(command.name);
  if (
    edit &&
    typeof command.args.name === "string" &&
    typeof command.args.parentPath === "string"
  )
    path = [command.args.parentPath, command.args.name]
      .filter(Boolean)
      .join("/");
  const parsed = projectFilePathSchema.safeParse(path);
  if (parsed.success && (edit || command.name === "readFile")) {
    const confirmed = result?.ok && result.changedFiles?.includes(parsed.data);
    files = mergeFileActivity(files, {
      path: parsed.data,
      status: !result
        ? edit
          ? "proposed"
          : "reading"
        : !result.ok
          ? "failed"
          : edit
            ? confirmed
              ? "changed"
              : "proposed"
            : "read",
    });
  }
  if (result?.ok)
    for (const changedPath of result.changedFiles ?? []) {
      const validated = projectFilePathSchema.safeParse(changedPath);
      if (validated.success)
        files = mergeFileActivity(files, {
          path: validated.data,
          status: "changed",
        });
    }
  return files;
};
