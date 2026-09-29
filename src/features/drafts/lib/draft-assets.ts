import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";

const draftAssetFolder = "codaloud-draft-assets";

export const draftAssetFile = (draftId: string) =>
  new File(
    Paths.document,
    draftAssetFolder,
    z.uuid().parse(draftId).toLowerCase(),
    "content",
  );

export const draftAssetDirectory = (draftId: string) =>
  new Directory(
    Paths.document,
    draftAssetFolder,
    z.uuid().parse(draftId).toLowerCase(),
  );

export const draftHasAsset = (draftId: string) => draftAssetFile(draftId).exists;

export const removeDraftAsset = (draftId: string) => {
  const asset = draftAssetFile(draftId);
  if (asset.exists) asset.delete();
};
