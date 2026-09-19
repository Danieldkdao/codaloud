# Native editor setup

The C++ and Swift sources belong to native build targets. Opening a source file
without those targets' compiler flags can report missing modules and cascade into
unrelated type errors even when the application builds successfully.

## Dependencies and headers

- `nlohmann/json.hpp` is prepared under `modules/local-workspace/vendor/nlohmann`.
- `git2.h` comes from `modules/local-workspace/vendor/libgit2/include`.
- `jni.h` belongs to the Android NDK sysroot, not npm or a separate application package.
- `ExpoModulesCore` is an Expo dependency linked through CocoaPods. Open
  `ios/codaloud.xcworkspace`, not the individual Swift file or only the Xcode project.

Run `pnpm prepare:native` to install the pinned C++ sources. Build with `pnpm ios`
or `pnpm android` to generate the platform projects and native dependency context.
These native modules require a development build; Expo Go does not contain them.

## C++ indexing

Run `pnpm configure:native-editor` from the repository root. It builds the host
engine and writes an ignored root `compile_commands.json` using actual CMake
commands. When an Android build exists, it includes that target's command for the
JNI bridge, including its NDK sysroot. Build Android once and rerun the command if
it reports that Android context is unavailable.

Clangd discovers this file automatically; the VS Code C/C++ extension is also
configured to use it. Restart the active language server after generation. Use one
C++ language extension for diagnostics to avoid duplicate messages from a second,
unconfigured extension.

## Swift indexing outside Xcode

Install `xcode-build-server` (for example, `brew install xcode-build-server`), build
iOS once, then run `pnpm configure:native-editor --ios`. The script writes an
ignored root `buildServer.json` for SourceKit-LSP and the existing CocoaPods
workspace. Use SourceKit-LSP from the same Xcode installation as the build.
Restart the Swift language server afterward. Rebuild iOS when Pods or compiler
settings change so the build server sees current compiler flags.

For a project-local tool installation instead of Homebrew:

```sh
git clone --depth 1 --branch v1.3.0 https://github.com/SolaWing/xcode-build-server.git modules/local-workspace/build-tools/xcode-build-server
```

The configuration script also recognizes that ignored location. Neither the tool
nor its generated machine-specific configuration is an app runtime dependency.

## Updating native dependencies

`scripts/native-dependencies.json` records exact versions, download locations, and
SHA-256 checksums. Normal installation verifies those sources and does not silently
change the native API used by an existing commit.

- `pnpm update:native` checks the latest stable upstream releases.
- `pnpm update:native --write` downloads compatible-major updates and updates the
  lock atomically. It refuses a new major version until compatibility is reviewed.
- After an update, run `pnpm prepare:native`, rebuild iOS and Android, run tests,
  and review dependency notices before committing the lock changes.

A new major version may require CMake, TLS, or native API changes; checking the
latest release does not establish compatibility. Build-tool downloads need a
network connection; normal on-device editing and local Git do not.

References: [Clangd compile commands](https://clangd.llvm.org/design/compile-commands),
[Android CMake toolchains](https://developer.android.com/ndk/guides/cmake),
[Expo local modules](https://docs.expo.dev/modules/get-started/),
[Xcode build server](https://github.com/SolaWing/xcode-build-server).
