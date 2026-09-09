export const getFileExtension = (fileName: string): string => {
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex <= 0 || extensionIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(extensionIndex + 1).toLowerCase();
};
