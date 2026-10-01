import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** @param {string} [root] @param {(file: string, args: string[], options: {stdio: "inherit", cwd?: string}) => unknown} [run] */
export const prepareIosNativeAssets = (
  root = projectRoot,
  run = execFileSync,
) => {
  const propertiesPath = join(root, "ios", "Podfile.properties.json");
  const properties = existsSync(propertiesPath)
    ? JSON.parse(readFileSync(propertiesPath, "utf8"))
    : {};
  const vendorName =
    properties["expo.sqlite.useSQLCipher"] === "true" ? "sqlcipher" : "sqlite3";
  const sqliteRoot = join(root, "node_modules", "expo-sqlite");

  // ExpoSQLite's podspec copies these into ios/ during pod install. A later
  // pnpm install can remove them while the existing Pods project still expects them.
  for (const file of ["sqlite3.c", "sqlite3.h"]) {
    const destination = join(sqliteRoot, "ios", file);
    if (existsSync(destination)) continue;
    const source = join(sqliteRoot, "vendor", vendorName, file);
    if (!existsSync(source))
      throw new Error(`Missing Expo SQLite native source: ${source}`);
    copyFileSync(source, destination);
  }
  const ghosttyRoot = join(root, "node_modules", "expo-libghostty");
  const manifestPath = join(ghosttyRoot, "vendor-manifest.json");
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const frameworks = join(ghosttyRoot, "ios", "vendor", "Frameworks");
  const info = join(frameworks, "GhosttyKit.xcframework", "Info.plist");
  const stamp = join(frameworks, ".checksum");
  const checksum = manifest["libghostty-spm"].xcframework.sha256;
  if (
    !existsSync(info) ||
    !existsSync(stamp) ||
    readFileSync(stamp, "utf8").trim() !== checksum
  ) {
    // A reinstall can retain Pods while losing this postinstall download.
    // Clear partial stamps so the package restores its checksum-pinned artifact.
    rmSync(stamp, { force: true });
    run(
      process.execPath,
      [join(ghosttyRoot, "scripts", "download-xcframework.mjs")],
      { stdio: "inherit" },
    );
  }
  if (
    !existsSync(info) ||
    !existsSync(stamp) ||
    readFileSync(stamp, "utf8").trim() !== checksum
  )
    throw new Error(
      "The terminal framework could not be restored. Run pnpm rebuild expo-libghostty before building iOS.",
    );
  const settings = join(
    root,
    "ios",
    "Pods",
    "Target Support Files",
    "GhosttyKit",
    "GhosttyKit.debug.xcconfig",
  );
  // Pods generated without the binary omit its headers even after download.
  if (
    existsSync(settings) &&
    !readFileSync(settings, "utf8").includes("/GhosttyKit/Headers")
  )
    run("pod", ["install"], { cwd: join(root, "ios"), stdio: "inherit" });
};
