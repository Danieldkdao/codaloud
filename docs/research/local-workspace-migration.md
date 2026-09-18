# Local workspace migration

Status: foundation only; the running app still uses its existing server actions.

## Target behavior

- iOS and Android own durable project files, repository history, editor recovery,
  and project metadata. Ordinary reads, saves, and local Git operations work offline.
- SQLite holds application records. Each project has a normal filesystem working
  tree and `.git` directory, operated on by a native libgit2 integration.
- GitHub clone/fetch/pull/push remain explicitly network-dependent.
- Daytona is retained for requested execution against a captured local snapshot.
  Collect results before cleanup. Returned source changes must be compared against
  the captured base before applying them to a workspace edited in the meantime.

## Verified starting point — September 18, 2026

- Git branch: `feat/code-editing-features`.
- Neon project: `broad-mouse-05015150`; development branch:
  `br-frosty-rice-a5zwwgyu`. Production was not queried or modified.
- Development contains one user, one account, three sessions, no verification
  records, three projects, and fifteen historical project operations.
- All three projects reference Daytona sandboxes; only two reference GitHub
  repositories. A fresh GitHub clone cannot replace workspace migration.
- All operation records are terminal: fourteen succeeded, one failed.
- Baseline: TypeScript passed; 2,832 tests passed and 81 were skipped.
- No database rows, source files, Git objects, or credentials have been migrated
  or deleted. No database connection strings belong in the native bundle.

## Required account decision

The old database combines application data with Better Auth's shared identity
store. Local SQLite cannot replace the remote authority that validates sessions,
holds an OAuth client secret, and authorizes paid cloud execution.

Choose one before changing authentication or activating the local data path:

1. Remove Codaloud sign-in for local use; provide optional GitHub connection with
   device-held credentials and define authorization for cloud execution separately.
2. Retain cloud accounts and their server-side authentication storage while moving
   project storage and operations to the device.

Existing encrypted OAuth tokens must not simply be copied into ordinary SQLite
tables. Decide on authenticated credential transfer or reconnection and store any
device credentials in Keychain/Keystore. Other users' sessions and account secrets
must never be included in an app bundle or a user's import.

## Implementation sequence

Each step is divided into coherent commits, generally fewer than ten authored
files, and verified before connecting its consumers.

1. **SQLite foundation (implemented, not connected).** SDK 57 SQLite/filesystem
   dependencies, transactional initialization, local project schema, and an
   owner-scoped project store. Tests execute the production Drizzle queries
   against real SQLite. Keep existing server storage active until import succeeds.
2. **Native filesystem and Git.** Pin libgit2, provide reproducible builds and Expo
   bindings for both platforms, and preserve the existing action result contracts.
   Validate path containment, symlinks, atomic saves, concurrent mutations,
   detached/unborn HEAD, selected-path commits, branches, diffs/history, stash,
   reset/revert, conflicts, and remote operations. Do not substitute unsupported
   operations with successful empty results.
3. **Recover existing workspaces.** Export owner-scoped metadata and operation
   history consistently. Capture files, untracked/ignored user content, `.git`,
   refs, index/staged changes, stashes, and repository configuration. Exclude
   credentials from portable Git configuration. Import into staging, verify
   hashes/counts, and publish the local workspace only after validation. A failed
   or repeated import must neither overwrite local work nor delete the source.
4. **Switch actions and hooks.** Connect project CRUD, file browsing/search,
   editing/saves, and Git to local services. Remove authentication/network gating
   from local operations according to the selected account model. Ensure TanStack
   Query does not pause local operations when offline. Preserve document version
   checks and cache invalidation across file/branch changes.
5. **Cloud boundaries.** Keep only actual remote Git/network operations online.
   Replace persistent Daytona workspace dependencies with explicit snapshot-based
   execution. Revisit code intelligence: it currently calls a server and may
   execute tooling in Daytona; moving Git alone does not make diagnostics offline.
6. **Cutover and verification.** Migrate the actual development user's projects
   onto the intended device, compare metadata and Git state, and exercise airplane
   mode plus process restarts. Verify iOS and Android native builds and workflows.
   Remove obsolete runtime Postgres/project APIs only once their replacements are
   complete. Keep source data recoverable; deleting Neon or old sandboxes is a
   separate irreversible operation, not an implicit migration step.

## Native feasibility findings

- libgit2 v1.9.7 was downloaded from its official GitHub release. Its static builds
  succeeded for macOS and iOS arm64 with HTTPS via SecureTransport.
- These are library builds, not an integrated Expo module or functional Git test.
- No Android SDK/NDK was found at the checked standard installation locations;
  Android compilation and HTTPS integration remain unverified.
- The scaffold and temporary builds are outside the repository. No unfinished
  native module is autolinked into the app.

## Official references

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Expo filesystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [Drizzle SQLite integration](https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite)
  — use the installed 0.45.2 API, not the newer RC installation instructions.
- [libgit2 build and platform guidance](https://github.com/libgit2/libgit2/blob/v1.9.7/README.md)
- [GitHub OAuth authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

The Codaloud Notion document was checked. Its prior online-only architecture is
superseded by the user's local-workspace direction; account behavior is pending.
