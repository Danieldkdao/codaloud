import { Image } from "react-native";

// Resolve a bundled asset to a URL that fetch can read. React Native returns a
// dev server URL in development and a local asset path in release, and both
// work with fetch. A string is treated as an already resolved path, which lets
// a runtime be pointed at an asset downloaded at runtime.
export const resolveNativeAssetUrl = (
  asset: number | string | undefined,
): string | null => {
  if (typeof asset === "string") return asset;
  if (typeof asset !== "number") return null;
  try {
    return Image.resolveAssetSource(asset)?.uri ?? null;
  } catch {
    return null;
  }
};
