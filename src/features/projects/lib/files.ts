import type { FileInfo } from "@daytona/sdk";

export const getDirectoryFiles = <T extends Pick<FileInfo, "name" | "path" | "isDir">>(
  files: readonly T[],
  directoryPath: string,
): T[] => {
  const prefix = directoryPath === "" ? "" : `${directoryPath.replace(/\/+$/, "")}/`;

  return files.filter((file) => {
    const path = file.path?.replace(/\/+$/, "");
    if (!path?.startsWith(prefix)) return false;
    const relativePath = path.slice(prefix.length);
    return relativePath.length > 0 && !relativePath.includes("/");
  }).sort((first, second) => {
    if (first.isDir !== second.isDir) return first.isDir ? -1 : 1;
    if (first.isDir && first.name.startsWith(".") !== second.name.startsWith(".")) {
      return first.name.startsWith(".") ? -1 : 1;
    }
    return first.name.localeCompare(second.name, "en", {
      numeric: true,
      sensitivity: "base",
    });
  });
};
