# Local workspace migration

Status: the application now uses device SQLite, local files, and a native libgit2
engine. Mandatory Codaloud sign-in and the obsolete cloud implementation are removed.
Android runtime and live OAuth verification remain outstanding.

## Device ownership and optional connections

The landing screen enters a persistent local workspace without an account. Its
random device owner ID scopes local records and query caches; it is not a server
identity. SQLite stores projects, entry preferences, Git author details, and the
migration audit trail. Normal working trees and `.git` directories live alongside
it in the app's private documents/files directory.

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

## Development data cutover — September 18, 2026

- Git branch: `feat/code-editing-features`.
- Neon project: `broad-mouse-05015150`; development branch:
  `br-frosty-rice-a5zwwgyu`. Production was not queried or modified.
- All three development projects were exported with their complete workspace
  archives and per-file manifests, including ignored/untracked content and Git
  metadata where present. Source worktrees were not replaced with fresh clones.
- The importer verified archive and file SHA-256 hashes, Git refs, worktree/index
  status, and repository integrity before publishing the worktrees and SQLite
  records. The source project without `.git` received a new empty local repository.
- Three projects and fifteen historical operation records were imported into the
  development iOS simulator (`BC20715B-DFC7-4C91-AC19-3422DDF2301C`). Original owner
  references remain in the audit metadata; project ownership uses the device ID.
- Source account sessions and encrypted OAuth credentials were not copied. Reconnect
  GitHub explicitly. Unsafe host-specific Git config and embedded credentials are
  excluded from portable repository configuration; the original archive is intact.
- SQLite integrity/foreign-key checks passed. Repeating the same import is a no-op;
  conflicting existing project IDs/folders are rejected rather than overwritten.
- Neon rows and original Daytona worktrees remain intact. Sandboxes were stopped
  after their snapshots to stay within the workspace's concurrent-memory quota.
  No source sandbox or database was deleted.

The private export currently lives at `/tmp/codaloud-development-migration`; it
must not be committed, bundled with the app, or mistaken for durable backup storage.
The imported simulator data is in its app Documents directory. No physical device
or Android device has received these development projects yet.

## Migration tools

The input `metadata.json` is the read-only Neon development export with `source`,
`authors` (public author fields only), `projects`, and terminal `operations`.

1. `node --env-file=.env scripts/export-legacy-workspaces.mjs <export-directory>`
   uses the existing Daytona key solely to recover old workspaces. The Python
   snapshot helper locks Git mutations and compares inventories before/after export.
2. `node scripts/import-legacy-workspaces.mjs <export-directory> <app-documents>`
   requires Node 24+, Python 3.11+, and Git. Stop the app before running it against
   its data directory. It stages extraction, validates contents, sanitizes portable
   Git config, then inserts SQLite records transactionally.
3. Normal startup applies bundled SQLite migrations without a network request.

Failed imports roll back database writes and remove only directories created by
that attempt. A process crash during directory publication may leave an orphan
folder; the next run refuses to overwrite it. Inspect/recover that folder before
retrying rather than deleting it blindly.

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
  been removed. Device SQLite, native Git, optional GitHub OAuth, migration tools,
  and temporary Daytona execution remain. No Neon data or source worktree was deleted.
- Verification after pruning cloud dependencies: TypeScript passed and all 74 test
  suites passed (1,221 tests; no skipped tests). The retained OAuth routes export
  independently of Postgres and Better Auth. iOS and Android production JavaScript
  exports, including the embedded CodeMirror DOM bundle, also passed after cleanup.
- Removing source Trigger tasks does not disable any previously deployed schedules.
  No remote Trigger deployment or schedule was modified.
- The standalone iOS app passed native checks for Get started entry, imported project visibility,
  restart persistence, reading the imported file tree, and opening local Git status
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
