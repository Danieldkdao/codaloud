# Local workspace migration

Status: the application now uses device SQLite, local files, and a native libgit2
engine. Mandatory Codaloud sign-in and the obsolete cloud implementation are removed.
Android runtime and live OAuth verification remain outstanding.

## Device ownership and optional connections

The landing screen enters a persistent local workspace without an account. Its
random device owner ID scopes local records and query caches; it is not a server
identity. SQLite stores projects, entry preferences, and Git author details.
Normal working trees and `.git` directories live alongside it in the app's private
documents/files directory.

GitHub is optional. Its OAuth code exchange retains two Expo API routes and the
server-held OAuth client secret. The native app validates authorization state and
uses PKCE, then stores tokens in SecureStore. Connecting or disconnecting GitHub
does not remove or change local projects. Remote commands offer a Settings link
when credentials are needed. Commit author details are configured locally.

Project CRUD, file browsing/search/saves, branches, commits, diffs/history,
stashes, undo/revert/discard, and TypeScript analysis use local implementations.
TanStack Query local operations run even when the network manager reports offline.
Remote branch/history views read fetched tracking refs. Clone/fetch/pull/push
remain network operations. The supported remote transport is HTTPS GitHub.

## Fresh local projects and schema upgrades

Legacy Neon/Daytona data transfer is no longer supported or required. The export,
snapshot, extraction, and import scripts and the import-history model have been
removed. New installations start with an empty project list. Projects are created
locally or cloned from GitHub through the normal project creation flow.

Bundled SQLite migrations remain for creating and updating the on-device tables.
Startup checks SQLite's schema version and applies missing schema changes without
network access. The schema upgrade drops the obsolete cloud-import audit table;
it does not restore or copy any cloud records or files.

The workspace row still stores current device preferences and Git author details.
Local archive/restore operations protect against interrupted project deletions;
they do not retrieve data from the previous cloud architecture.

## Native engine and builds

`modules/local-workspace` wraps pinned libgit2 1.9.7 with C++17, Swift/Objective-C++,
and Kotlin/JNI. iOS uses SecureTransport; Android uses Mbed TLS 3.6.7 with Android's
system trust anchors. Remote credentials are passed per operation and never written
to Git configuration. Native dependency notices are packaged on both platforms.

Per-project locks serialize saves and Git mutations. Paths reject traversal,
reserved Git metadata, and symlinks. Saves use content hashes and atomic replacement.
Selected-path commits preserve unrelated staged changes. Destructive operations
require current preview fingerprints or commit/stash identities. Conflicted pulls
leave branch/worktree contents unchanged. Force push checks the observed remote OID.

Installation prepares pinned native dependencies and the bundled TypeScript 6.0.3
compiler/standard libraries. `pnpm build:native:ios` builds the iOS XCFramework;
the Expo config plugin also runs it before CocoaPods on a fresh prebuild. CMake and
Ninja must be installed on the build host. Android compiles the shared C++ library
through Gradle/CMake. `pnpm test` builds the host integration-test executable first.
The file-remote test transport is enabled only for that host test build.

## Optional Daytona execution

`executeTemporaryCode` accepts an explicit file snapshot, command, requested output
paths, and caller-supplied Daytona API key. It provisions an ephemeral sandbox,
collects results, and attempts deletion in `finally`, including failure paths.
Cleanup failures propagate to the caller. Returned files must be conflict-checked
before applying them to a local workspace. This is an integration boundary, not a
new execution UI or an anonymous endpoint funded by an application's shared key.

## Verification and remaining limits

- The legacy Postgres schemas/migrations, mandatory session backend, persistent
  Daytona workspace adapters, Trigger jobs, and their obsolete transport tests have
  been removed. Device SQLite, native Git, optional GitHub OAuth, schema migrations,
  and temporary Daytona execution remain. No Neon data or source worktree was deleted.
- Verification after pruning cloud dependencies: TypeScript passed and all 74 test
  suites passed (1,221 tests; no skipped tests). The retained OAuth routes export
  independently of Postgres and Better Auth. iOS and Android production JavaScript
  exports, including the embedded CodeMirror DOM bundle, also passed after cleanup.
- Removing source Trigger tasks does not disable any previously deployed schedules.
  No remote Trigger deployment or schedule was modified.
- The standalone iOS app previously passed native checks for Get started entry, project visibility,
  restart persistence, reading the local file tree, and opening local Git status
  without Metro. The Android
  Kotlin/JNI module and all its configured native architectures compiled successfully.
  The complete Android arm64 debug app also compiled successfully. Android runtime
  behavior still needs a device/emulator check. Remote GitHub OAuth against
  the live provider and authenticated push have not been exercised with user credentials.

## Official references

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Expo filesystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [Expo config plugins](https://docs.expo.dev/config-plugins/development-and-debugging/)
- [Drizzle Expo SQLite integration](https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite)
  — implementation uses the installed 0.45.2 API.
- [libgit2 1.9.7](https://github.com/libgit2/libgit2/tree/v1.9.7)
- [GitHub OAuth authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Daytona TypeScript SDK](https://www.daytona.io/docs/en/typescript-sdk/)

The Codaloud Notion document was checked. The user's local-workspace and optional
GitHub instructions supersede its prior online-only/account requirements.
