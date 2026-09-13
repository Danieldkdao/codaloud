# Live sandbox commit history

Researched September 12, 2026. Proposal for review; application code has not been implemented and no live sandbox was accessed.

## Finding and recommendation

**Daytona has a commit-history endpoint: `GET /git/history?path=<repository>`.** Status reports working-tree and branch information, not the commit list. The endpoint is documented under the Toolbox HTTP API, even though the public TypeScript Git class has no `history()` or `log()` method. [Daytona Git operations](https://www.daytona.io/docs/en/git-operations/#get-commit-history), [TypeScript Git reference](https://www.daytona.io/docs/en/typescript-sdk/git/)

Use that endpoint first for the requested basic list, behind the existing server-side Daytona transport. This reads the sandbox repository, so locally created, unpushed commits belong in the history too; a GitHub commit-list API would not be the right source for those. Confirm the endpoint's deployed behavior before committing to it for large histories. Use `git log` through Daytona process execution if we need explicit pagination, revision selection, or parent IDs. This recommendation extends the existing [Daytona capabilities research](daytona-git-capabilities.md).

The Notion [Codaloud requirements](https://app.notion.com/p/3d2b3d6d3d6f809b9c82e98a68e01be1), fetched by the parent research task, require basic history and current-branch information; a graph is optional. Proposed initial scope is history for the sandbox's current checkout. Branch switching, commit diffs, and graph data are separate work.

## Exact compatibility and limitations

- This project uses **`@daytona/sdk` 0.210.0** (not `@daytonaio/sdk`), verified in the installed [package](../../node_modules/@daytona/sdk/package.json). The live Daytona docs display v0.211; the inspected installed SDK is the compatibility baseline.
- The generated **Toolbox client 0.210.0** exposes `GitApi.getCommitHistory(path)` returning `GitCommitInfo[]`. Its sole documented endpoint argument is `path`; there are no limit, cursor, branch, revision, or file-filter arguments. [Installed API declaration](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/api/git-api.d.ts)
- Each record has `hash`, `message`, `author`, `email`, and `timestamp`, all strings. Parent IDs, refs/tags, and patch content are absent. The contract does not specify whether `timestamp` is the author or committer date, or its string format. Do not rename it `committedAt` until verified. [Installed response model](../../node_modules/.pnpm/@daytona+toolbox-api-client@0.210.0/node_modules/@daytona/toolbox-api-client/src/models/git-commit-info.d.ts)
- Published documentation and the installed contract do not establish ordering, maximum result count, unborn-repository behavior, or whether messages contain subjects or full bodies. Treat these as verification items, not guarantees. Do not implement client-side slicing and call it server pagination.
- The exact [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) was read before authoring examples. Installed Expo is requested as `~57.0.20`; the proposal uses the existing Expo API server boundary for the iOS/Android app. No web application target or new dependency is required.

## Main server-side example

This is the provider adapter shape, using the existing authenticated [Daytona API helper](../../src/services/daytona/api.ts) and home-directory response pattern from [filesystem.ts](../../src/services/daytona/filesystem.ts). The route must authenticate the user, verify project ownership, and obtain the sandbox ID from the project's saved sandbox record before calling it. The caller cannot supply an arbitrary repository path or sandbox ID.

```ts
import { posix } from "node:path";
import { z } from "zod";
import {
  getSandboxToolboxUrl,
  requestDaytona,
} from "@/services/daytona/api";

const daytonaCommitSchema = z.object({
  hash: z.string().min(1),
  message: z.string(),
  author: z.string(),
  email: z.string(),
  timestamp: z.string(),
});
export type DaytonaCommitSchema = z.infer<typeof daytonaCommitSchema>;

const homeDirectorySchema = z.object({
  dir: z.string().startsWith("/").min(2),
});
export type HomeDirectorySchema = z.infer<typeof homeDirectorySchema>;

export const readSandboxCommitHistory = async (
  sandboxId: string,
  projectId: string,
) => {
  const toolboxUrl = await getSandboxToolboxUrl(sandboxId, projectId);
  const home = homeDirectorySchema.parse(
    await requestDaytona(`${toolboxUrl}/user-home-dir`),
  );
  const url = new URL(`${toolboxUrl}/git/history`);
  url.searchParams.set("path", posix.join(home.dir, ".codaloud", "workspace"));

  return z.array(daytonaCommitSchema).parse(
    await requestDaytona(url.toString()),
  );
};
```

This illustrative adapter preserves provider errors for the API route to translate. The **client read action** follows the project's separate convention: return validated data (including `[]`) on success and `null` for validation/request/response failures. The query hook must treat `null` as a failure so an outage cannot appear as an empty repository. If implementing shared home resolution, extract and reuse the existing behavior rather than maintain duplicate production helpers.

`getSandboxToolboxUrl` already verifies sandbox labels/state and can initiate restoration of a stopped sandbox. Reuse that behavior and show the existing restoration/retry experience; do not create a replacement sandbox. The workspace path is the same `.codaloud/workspace` used by [the clone service](../../src/services/daytona/clone-github-repository.ts). These are codebase observations, not new Daytona guarantees.

Normalize the response into feature data at the server boundary, retaining the full hash for identity. Render a short hash and date with the existing named feature formatters. Preserve the full message; derive the one-line display subject separately once the endpoint's message semantics have been checked. Omit optional refs and merge badges, since this endpoint supplies neither.

## Alternative when explicit control is required

The installed SDK supports `sandbox.process.executeCommand(command, cwd, env, timeout)`. Timeout is the **fourth argument**, in seconds; the documentation contains an older example with a third-position timeout, so follow the actual signature. [Daytona Process reference](https://www.daytona.io/docs/en/typescript-sdk/process/#executecommand), [installed declaration](../../node_modules/@daytona/sdk/esm/Process.d.ts)

For an already validated repository with a valid `HEAD`, this bounded command is a starting point:

```ts
const result = await sandbox.process.executeCommand(
  "git --no-pager log --no-color --no-decorate --no-show-signature " +
    "--date-order --max-count=51 -z " +
    "--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%cI%x00%s HEAD --",
  repositoryPath,
  undefined,
  10,
);

if (result.exitCode !== 0) {
  throw new Error("Unable to read commit history.");
}
```

`%H` is the full hash; `%P` supplies parent IDs; `%an`/`%ae` identify the author; `%aI`/`%cI` distinguish author and committer dates; `%s` is the subject. `%x00` produces NUL field separators. `-z` provides NUL record termination. Parse fixed groups of seven fields after checking/removing the final terminator, and validate every record; avoid splitting on lines or `|`, which can occur in commit data. If a malformed record introduces an unexpected delimiter, reject the output instead of displaying misaligned fields. [Git pretty formats](https://git-scm.com/docs/pretty-formats), [Git log](https://git-scm.com/docs/git-log)

For production pagination, propose pages of 50 and fetch 51 to determine `hasMore`. Resolve the initial `HEAD` to a full commit hash and retain it in a validated cursor with the offset; subsequent `--skip` reads must use that same hash, otherwise new commits shift offsets and cause duplicates or gaps. Refresh starts a new snapshot. This is an application design using Git's revision/skip controls, not a Daytona cursor API. Bound offsets, subprocess output, and time. For dynamic inputs, reuse [createSandboxCommand](../../src/services/daytona/create-command.ts) and invoke Git with `execFile` argument arrays inside the sandbox; do not concatenate caller-supplied refs into shell commands. [Git log](https://git-scm.com/docs/git-log), [Git revision verification](https://git-scm.com/docs/git-rev-parse)

Do not treat every nonzero log/HEAD-resolution exit as “no commits.” Verify that the target is a repository and distinguish an unborn branch (symbolic `HEAD` points to an absent branch ref) from a bad path, missing Git binary, corrupt repository, or failed process. The REST endpoint's empty behavior must likewise be established before error mapping. Do not auto-initialize or fetch while reading history. [Git symbolic refs](https://git-scm.com/docs/git-symbolic-ref), [Git revision verification](https://git-scm.com/docs/git-rev-parse)

## Proposed implementation and verification

1. **Backend history slice:** Write focused behavior tests first for owned-project lookup, real-data response, empty success, malformed/upstream failure, and unavailable/restoring sandbox handling. Add the provider adapter, feature response schema/types, authenticated project history API route, and client read action. Reuse ownership/sandbox access helpers. Keep this chunk below ten changed files. Verify with the focused tests and TypeScript; never add dedicated schema tests.
2. **Native history slice:** Add a user- and project-scoped TanStack Query hook with all query options inside it. Wire the existing commit list to live data, add loading/error/empty/retry and pull-to-refresh states, and replace the mocked current-branch label with actual status/branch data. Disable dummy branch selection until live branch browsing is implemented; it must not relabel the same history as another branch. Keep this chunk below ten changed files; if branch-context wiring exceeds that budget, complete it as a separate small prerequisite chunk. Write focused behavior tests before implementation, then verify the hook's failure behavior and the history screen on both iOS and Android.

Before finalizing transport during implementation, make a read-only comparison against `git log` in the user's existing sandbox and check: count/order, timestamp semantics, full versus subject message, and presence of local unpushed commits. Exercise unborn/missing repositories and a history larger than one page in a disposable fixture, not by modifying the user's cloned repository. If the endpoint silently caps history or cannot support the agreed bound, use the CLI adapter behind the same feature contract.

This research verified documentation and installed client contracts. It did not verify the deployed Toolbox's runtime behavior, run the app, change dependencies, or implement the feature.
