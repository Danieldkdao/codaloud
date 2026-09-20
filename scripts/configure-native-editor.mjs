import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { glob, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = join(root, "modules/local-workspace");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--ios"))
  throw new Error("Usage: pnpm configure:native-editor [--ios]");

await import("./build-local-workspace-host.mjs");
const host = JSON.parse(
  await readFile(join(moduleRoot, "build-host/compile_commands.json"), "utf8"),
);
const commands = host.filter((entry) =>
  entry.file.startsWith(join(moduleRoot, "cpp")),
);
// JNI must use the Android toolchain/sysroot, not the Mac compiler's headers.
const androidDatabases = [];
for await (const path of glob("android/.cxx/**/compile_commands.json", {
  cwd: moduleRoot,
})) {
  const absolute = join(moduleRoot, path);
  androidDatabases.push({
    path: absolute,
    modified: (await stat(absolute)).mtimeMs,
  });
}
androidDatabases.sort((a, b) => b.modified - a.modified);
let hasAndroid = false;
for (const database of androidDatabases) {
  const entries = JSON.parse(await readFile(database.path, "utf8"));
  const bridge = entries.find(
    (entry) => entry.file === join(moduleRoot, "cpp/android-bridge.cpp"),
  );
  if (bridge) {
    commands.push(bridge);
    hasAndroid = true;
    break;
  }
}
await writeFile(
  join(root, "compile_commands.json"),
  `${JSON.stringify(commands, null, 2)}\n`,
);
console.log(`Configured C++ indexing (${commands.length} source files).`);
if (!hasAndroid)
  console.log(
    "Build Android once with pnpm android, then rerun this command to index jni.h with the NDK.",
  );

if (args.includes("--ios")) {
  const workspace = join(root, "ios/codaloud.xcworkspace");
  if (!existsSync(workspace))
    throw new Error("Run pnpm ios first to generate the CocoaPods workspace.");
  const localServer = join(
    moduleRoot,
    "build-tools/xcode-build-server/xcode-build-server",
  );
  const server = existsSync(localServer) ? localServer : "xcode-build-server";
  try {
    execFileSync(
      server,
      ["config", "-workspace", workspace, "-scheme", "codaloud"],
      { cwd: root, stdio: "inherit" },
    );
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(
        "Install xcode-build-server (brew install xcode-build-server), then rerun with --ios.",
      );
    throw error;
  }
  console.log(
    "Configured Swift indexing from the CocoaPods workspace. Rebuild iOS if its build log is stale.",
  );
}
console.log(
  "Restart the editor's C++/Swift language servers to pick up the generated build context.",
);
