# Daytona file and folder creation

Researched September 10, 2026. This is a proposal and API illustration; no sandbox commands were executed.

## Supported operations

The installed `@daytona/sdk` is **0.210.0**. Its declarations support the following APIs, matching the current [TypeScript filesystem reference](https://www.daytona.io/docs/en/typescript-sdk/file-system/):

| Purpose | SDK call |
| --- | --- |
| Create a directory | `sandbox.fs.createFolder(path, '755')` |
| Create/write a small file | `sandbox.fs.uploadFile(Buffer.from(content), path)` |
| Create/write an empty file | `sandbox.fs.uploadFile(Buffer.alloc(0), path)` |
| Read a directory | `sandbox.fs.listFiles(path)` |
| Read metadata | `sandbox.fs.getFileDetails(path)` |

Use an absolute, server-resolved workspace path. Relative filesystem paths use the sandbox working directory. The proposed Codaloud workspace is `${userHomeDir}/.codaloud/workspace`, established during sandbox preparation and saved as `workspacePath`; this is planned behavior, not an already-created directory. See the [Sandbox Creation Plan](https://app.notion.com/p/3d5b3d6d3d6f8128ac13d186ea7e28c1).

`getUserHomeDir()` supplies the sandbox user's home directory. In installed 0.210.0 its result is `string | undefined`, despite current docs showing `string`; check it before constructing the workspace path. See the [sandbox reference](https://www.daytona.io/docs/en/typescript-sdk/sandbox/#getuserhomedir) and [installed declaration](../node_modules/@daytona/sdk/cjs/Sandbox.d.ts).

## Manual terminal commands

Run these locally after choosing an existing sandbox. Substitute its real ID/name and the prepared workspace path. The `notes` folder must be new; `touch` creates an empty file if absent and preserves existing contents, while updating timestamps. Daytona documents `exec`, `--cwd`, authentication, and installation in its [CLI reference](https://www.daytona.io/docs/en/tools/cli/).

```sh
# Only if the CLI is not installed:
brew install daytonaio/cli/daytona

daytona login
daytona list

daytona exec SANDBOX_ID --cwd /ACTUAL/WORKSPACE/PATH -- mkdir -- notes
daytona exec SANDBOX_ID --cwd /ACTUAL/WORKSPACE/PATH -- touch -- notes/hello.txt
daytona exec SANDBOX_ID --cwd /ACTUAL/WORKSPACE/PATH -- ls -la notes
```

## Minimal server-side SDK example

This demonstrates the API calls for a running sandbox and an already-prepared workspace. `workspacePath` comes from trusted project state after authentication/ownership checks. `notes/hello.txt` must not already exist because upload overwrites files.

```ts
import { Buffer } from 'node:buffer';
import type { Sandbox } from '@daytona/sdk';

const createExampleEntries = async (
  sandbox: Sandbox,
  workspacePath: string,
) => {
  const folderPath = `${workspacePath}/notes`;
  const filePath = `${folderPath}/hello.txt`;

  await sandbox.fs.createFolder(folderPath, '755');
  await sandbox.fs.uploadFile(Buffer.alloc(0), filePath);

  return {
    createdFile: await sandbox.fs.getFileDetails(filePath),
    entries: await sandbox.fs.listFiles(folderPath),
  };
};
```

The [filesystem guide](https://www.daytona.io/docs/file-system-operations/) documents buffer uploads and directory creation. Passing a string as the first upload argument means a **local file path**, not text content.

## Implementation requirements

- Add New File/New Folder submission for the currently selected directory, with pending state, inline validation/errors, and a refreshed directory listing after success.
- Authenticate the API request, verify project ownership, retrieve its sandbox server-side, and require successful workspace preparation. Keep Daytona credentials on the server.
- Accept a name and workspace-relative parent path. Reject empty names, separators in names, traversal, and targets escaping the workspace; account for symlinks when resolving the actual parent.
- Report a conflict for an existing entry. `uploadFile` delegates to `uploadFiles` in [installed 0.210.0](../node_modules/@daytona/sdk/cjs/FileSystem.js), whose [documented behavior](https://www.daytona.io/docs/en/typescript-sdk/file-system/#uploadfiles) overwrites destinations. A separate existence check is subject to a race. For reliable creation with concurrent writers, use an atomic create-if-absent operation inside the sandbox rather than a check followed by upload; the SDK upload signature has no exclusive-create flag.
- Verify empty file creation, nested-directory selection, duplicate handling without content loss, invalid paths, unauthorized access, and refresh behavior on iOS and Android. The snippet above does not implement these production checks.
