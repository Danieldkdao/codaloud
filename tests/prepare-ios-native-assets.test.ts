import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { prepareIosNativeAssets } from "../scripts/prepare-ios-native-assets.mjs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("restores Expo SQLite native sources lost after reinstalling node_modules", () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-ios-assets-"));
  roots.push(root);
  const sqlite = join(root, "node_modules", "expo-sqlite");
  const vendor = join(sqlite, "vendor", "sqlite3");
  const ios = join(sqlite, "ios");
  mkdirSync(vendor, { recursive: true });
  mkdirSync(ios, { recursive: true });
  writeFileSync(join(vendor, "sqlite3.c"), "vendored c");
  writeFileSync(join(vendor, "sqlite3.h"), "vendored h");

  expect(existsSync(join(ios, "sqlite3.c"))).toBe(false);
  prepareIosNativeAssets(root);
  expect(readFileSync(join(ios, "sqlite3.c"), "utf8")).toBe("vendored c");
  expect(readFileSync(join(ios, "sqlite3.h"), "utf8")).toBe("vendored h");
});

it("preserves existing native sources on repeat launches", () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-ios-assets-"));
  roots.push(root);
  const sqlite = join(root, "node_modules", "expo-sqlite");
  const vendor = join(sqlite, "vendor", "sqlite3");
  const ios = join(sqlite, "ios");
  mkdirSync(vendor, { recursive: true });
  mkdirSync(ios, { recursive: true });
  for (const name of ["sqlite3.c", "sqlite3.h"]) {
    writeFileSync(join(vendor, name), "vendored");
    writeFileSync(join(ios, name), "existing");
  }
  prepareIosNativeAssets(root);
  expect(readFileSync(join(ios, "sqlite3.c"), "utf8")).toBe("existing");
  expect(readFileSync(join(ios, "sqlite3.h"), "utf8")).toBe("existing");
});

it("restores the pinned terminal framework before a native build after reinstall", () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-ghostty-assets-"));
  roots.push(root);
  const sqlite = join(root, "node_modules", "expo-sqlite");
  mkdirSync(join(sqlite, "vendor", "sqlite3"), { recursive: true });
  mkdirSync(join(sqlite, "ios"), { recursive: true });
  for (const name of ["sqlite3.c", "sqlite3.h"])
    writeFileSync(join(sqlite, "vendor", "sqlite3", name), "source");
  const ghostty = join(root, "node_modules", "expo-libghostty");
  const frameworks = join(ghostty, "ios", "vendor", "Frameworks");
  const framework = join(frameworks, "GhosttyKit.xcframework");
  mkdirSync(ghostty, { recursive: true });
  writeFileSync(
    join(ghostty, "vendor-manifest.json"),
    JSON.stringify({
      "libghostty-spm": { xcframework: { sha256: "pinned-sha" } },
    }),
  );
  const download = vi.fn(() => {
    mkdirSync(framework, { recursive: true });
    writeFileSync(join(framework, "Info.plist"), "framework");
    writeFileSync(join(frameworks, ".checksum"), "pinned-sha\n");
  });
  prepareIosNativeAssets(root, download);
  expect(download).toHaveBeenCalledWith(
    process.execPath,
    [join(ghostty, "scripts", "download-xcframework.mjs")],
    expect.objectContaining({ stdio: "inherit" }),
  );
  prepareIosNativeAssets(root, download);
  expect(download).toHaveBeenCalledOnce();
  rmSync(join(framework, "Info.plist"));
  prepareIosNativeAssets(root, download);
  expect(download).toHaveBeenCalledTimes(2);
});

it("repairs Pods generated while the terminal framework was absent without redownloading it", () => {
  const root = mkdtempSync(join(tmpdir(), "codaloud-ghostty-pods-"));
  roots.push(root);
  const sqlite = join(root, "node_modules", "expo-sqlite", "ios");
  mkdirSync(sqlite, { recursive: true });
  for (const name of ["sqlite3.c", "sqlite3.h"])
    writeFileSync(join(sqlite, name), "existing");
  const ghostty = join(root, "node_modules", "expo-libghostty");
  const frameworks = join(ghostty, "ios", "vendor", "Frameworks");
  mkdirSync(join(frameworks, "GhosttyKit.xcframework"), { recursive: true });
  writeFileSync(
    join(ghostty, "vendor-manifest.json"),
    JSON.stringify({
      "libghostty-spm": { xcframework: { sha256: "pinned-sha" } },
    }),
  );
  writeFileSync(
    join(frameworks, "GhosttyKit.xcframework", "Info.plist"),
    "framework",
  );
  writeFileSync(join(frameworks, ".checksum"), "pinned-sha");
  mkdirSync(join(root, "ios"), { recursive: true });
  writeFileSync(join(root, "ios", "Podfile"), "podfile");
  const settings = join(
    root,
    "ios",
    "Pods",
    "Target Support Files",
    "GhosttyKit",
    "GhosttyKit.debug.xcconfig",
  );
  mkdirSync(join(settings, ".."), { recursive: true });
  writeFileSync(settings, "HEADER_SEARCH_PATHS = $(inherited)");
  const repair = vi.fn(() => {
    writeFileSync(
      settings,
      'HEADER_SEARCH_PATHS = "${PODS_XCFRAMEWORKS_BUILD_DIR}/GhosttyKit/Headers"',
    );
  });
  prepareIosNativeAssets(root, repair);
  expect(repair).toHaveBeenCalledWith("pod", ["install"], {
    cwd: join(root, "ios"),
    stdio: "inherit",
  });
  prepareIosNativeAssets(root, repair);
  expect(repair).toHaveBeenCalledOnce();
});
