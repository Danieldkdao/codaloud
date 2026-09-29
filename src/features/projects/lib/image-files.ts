/** Formats the app can render as a picture instead of a text document. */
export const imageFileExtensions = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "heic",
  "heif",
  "avif",
  "bmp",
  "tiff",
  "tif",
  "ico",
  "svg",
] as const;
export type ImageFileExtension = (typeof imageFileExtensions)[number];

const imageExtensions = new Set<string>(imageFileExtensions);

export const isProjectImagePath = (path: string) => {
  const basename = path.split("/").at(-1)?.toLowerCase() ?? "";
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return false;
  return imageExtensions.has(basename.slice(dot + 1));
};
