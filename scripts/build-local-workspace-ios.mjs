import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./prepare-local-workspace.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../modules/local-workspace");
const build = (name, sdk, architecture) => {
  const directory = join(root, `build-${name}`);
  execFileSync("cmake", ["-S", root, "-B", directory, "-G", "Ninja",
    "-DCMAKE_SYSTEM_NAME=iOS", `-DCMAKE_OSX_SYSROOT=${sdk}`, `-DCMAKE_OSX_ARCHITECTURES=${architecture}`,
    "-DCMAKE_OSX_DEPLOYMENT_TARGET=16.4", "-DCMAKE_BUILD_TYPE=Release"], { stdio: "inherit" });
  execFileSync("cmake", ["--build", directory, "--target", "workspace-core", "-j", "8"], { stdio: "inherit" });
  const library = join(directory, "libcodaloud-workspace.a");
  execFileSync("xcrun", ["libtool", "-static", "-o", library,
    join(directory, "libworkspace-core.a"), join(directory, "vendor/libgit2/libgit2.a")], { stdio: "inherit" });
  return library;
};

const device = build("ios-arm64", "iphoneos", "arm64");
const simulatorArm = build("simulator-arm64", "iphonesimulator", "arm64");
const simulatorIntel = build("simulator-x86-64", "iphonesimulator", "x86_64");
const simulator = join(root, "build-simulator-universal/libcodaloud-workspace.a");
await mkdir(dirname(simulator), { recursive: true });
execFileSync("xcrun", ["lipo", "-create", simulatorArm, simulatorIntel, "-output", simulator]);
const framework = join(root, "ios/Frameworks/CodaloudWorkspace.xcframework");
await mkdir(dirname(framework), { recursive: true });
await rm(framework, { recursive: true, force: true });
execFileSync("xcodebuild", ["-create-xcframework", "-library", device, "-library", simulator, "-output", framework], { stdio: "inherit" });
