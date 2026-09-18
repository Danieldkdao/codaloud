import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("generates a resolvable scene configuration for iOS 27 launch", () => {
  const project = mkdtempSync(join(tmpdir(), "codaloud-scene-test-"));
  try {
    // A clean project prevents an old generated Info.plist from hiding a regression.
    for (const file of ["app.json", "package.json"])
      copyFileSync(resolve(file), join(project, file));
    for (const directory of ["node_modules", "assets", "src"])
      symlinkSync(resolve(directory), join(project, directory), "dir");
    const output = execFileSync(process.execPath, [
      resolve("node_modules/expo/bin/cli"), "config", project, "--type", "introspect", "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, EXPO_NO_DOTENV: "1", EXPO_OFFLINE: "1", CI: "1" },
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const config = JSON.parse(output);
    const manifest = config._internal.modResults.ios.infoPlist.UIApplicationSceneManifest;
    expect(manifest).toBeDefined();
    expect(manifest.UIApplicationSupportsMultipleScenes).toBe(false);
    expect(manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication).toEqual([
      expect.objectContaining({ UISceneDelegateClassName: "EXExpoAppSceneDelegate" }),
    ]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}, 35_000);
