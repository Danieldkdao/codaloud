# Reusing the Git route handler

Researched and implemented September 15, 2026.

## Scope and sources

The project uses Expo `~57.0.20`, Expo Router `~57.0.19`, and Zod `^4.5.4`. The [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) was checked before implementation. Expo API routes export HTTP-method handlers with standard `Request`/`Response` objects and dynamic path parameters; a shared function can produce these handlers without changing their URLs. [Expo API routes](https://docs.expo.dev/router/web/api-routes/)

Zod supports runtime input/output parsing and strict objects that reject unexpected fields. The shared handler keeps validation at the HTTP boundary while reusing existing feature schemas. [Zod API](https://zod.dev/api)

The Notion document [Codaloud](https://www.notion.so/3d2b3d6d3d6f809b9c82e98a68e01be1) was refreshed. Its applicable requirements are server-side authentication and project ownership, feature-owned business logic, optional GitHub connectivity for local Git, and preserving multi-step operation outcomes. This is an API refactor; it does not implement the separate future background-job architecture or change the native UI.

## Existing implementation audit

The older project Git handlers duplicated authentication, JSON/query parsing, private response headers, and safe error responses. Their existing services already enforce ownership and provider access:

| Handler | Existing service retained |
| --- | --- |
| POST commits | `commitUserProject`: read selection, stage selected paths, create commit. |
| GET commits | `readSandboxCommits` / `readGitHubCommits`: scoped cursor history. |
| POST checkout | `checkoutUserProjectBranch`: local/remote selection, access checks, locked checkout. |
| GET branches | `readUserProjectBranches`: workspace branch search/keyset pagination. |
| GET changes | `readSandboxChanges`: current repository changes and diffs. |
| GET commit details | `readSandboxCommitDetails` / `readGitHubCommitDetails`, followed by `validateProjectCommitDetails`. |

These services do not all fit a single sandbox command. Remote history can be read without a ready sandbox, and committing deliberately composes existing selection/staging/commit services. Replacing them with the new single-command runner would duplicate behavior and change authorization or operation semantics.

## Shared handler design

`createGitRoute` now accepts exactly one execution strategy, enforced by a TypeScript union:

- `script`: the existing mode. The handler resolves a ready owned project, optional author and GitHub credentials, then calls `executeGitOperation` through `requestDaytona`.
- `execute`: a service callback receiving validated input, authenticated user ID, original request and dynamic path parameters. Its service retains responsibility for project ownership, readiness where applicable, and provider access. Author/remote/script options cannot be mixed into this mode.

Both modes share authentication, project-ID validation, bounded JSON parsing, strict feature input validation, private response headers, output validation and safe error handling. No automatic operation retry was introduced. The original request preserves its headers and cancellation signal.

An optional query mapper combines query fields with trusted dynamic path parameters for existing schemas. Duplicate query keys and query attempts to override any path parameter are rejected before mapping. All new callback routes retain strict input schemas. The handler recognizes both existing safe service error classes, `SandboxFilesError` and `CommitHistoryError`.

Route-specific input, unavailable and unknown-outcome errors preserve established operation error codes. In particular, commit creation still reports `COMMIT_OUTCOME_UNKNOWN` after an unconfirmed execution or malformed result. Commit-details validation still checks identity, parent relationships, patch/summary consistency and GitHub URLs beyond the response shape.

## Compatibility and deliberate validation changes

- Existing URLs, valid request shapes, local/remote selection, cursor formats and success response shapes are retained.
- Explicit checkout destinations and history/commit selectors remain valid; these identify requested resources. Current-branch mutation behavior remains unchanged.
- Shared authentication and media-type failures now use the common Git messages. Invalid project IDs consistently use `INVALID_PROJECT`; branch query validation uses a stable generic message instead of the first Zod issue.
- Unsupported query fields, duplicate keys and mutation query options now fail instead of being ignored by older permissive handlers. This includes legacy `page`/`offset` fields and caller-supplied sandbox paths/IDs.
- JSON reads are bounded even without `Content-Length`. The default remains 64 KiB. Commit creation explicitly allows up to 128 MiB to accommodate its existing maximum of 5,000 paths of 4,096 characters, including JSON Unicode escapes; the feature schema still enforces those selection limits. Exceeding the transport limit returns `413 GIT_REQUEST_TOO_LARGE` before service execution.
- Existing services may independently revalidate sessions and inputs. Their checks remain intact because they also serve other callers.
- GitHub repository/branch picker routes are outside this project-Git handler: they authorize by repository ID before a project may exist. They do not have its required project ID or workspace contract.

## Verification

Tests were added before the corresponding implementation changes. Shared handler tests exercise callback context, absence of forced local-sandbox access, authentication/input gating, path/query ambiguity, safe history/workspace errors, validated outputs, mutation uncertainty and streamed body limits.

Route regression tests cover large commit selections, legacy/duplicate query rejection, checkout body limits, branch ownership and cursor behavior, working-change reads, and commit-detail identity/summary validation. Existing Git service tests continue to exercise the retained command implementations and `requestDaytona` paths.

Completed verification:

- Full suite: 113 test files passed; 2,316 tests passed and 81 platform-specific tests skipped.
- TypeScript: `tsc --noEmit` passed.
- Expo API-only export: all 22 routes exported successfully.
- `git diff --check` passed. New authored filenames use lowercase kebab-case.

The existing service fixtures and HTTP mocks do not constitute live GitHub/Daytona end-to-end execution.
