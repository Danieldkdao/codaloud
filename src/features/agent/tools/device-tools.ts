import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import * as file from "@/features/projects/actions/file-actions";
import * as git from "@/features/projects/actions/git-actions";
import * as publish from "@/features/projects/actions/publish-actions";
import {
  executeWorkspace,
  LocalWorkspaceError,
  withWorkspaceRevision,
} from "@/services/local-workspace/execute";
import { workspaceTools, type WorkspaceToolName } from "./workspace-tools";
import type { AgentCommandSchema, AgentToolResultSchema } from "../schemas";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";
import { collectFileDiagnostics } from "../lib/file-diagnostics";
import { editorPreferencesStore } from "@/features/settings/hooks/use-editor-preferences";
import {
  parsePathRules,
  pathRulesAreValid,
} from "@/features/settings/lib/path-rules";
import {
  assertWorkspaceToolAllowed,
  filterWorkspaceToolResult,
} from "../lib/workspace-access-policy";

export const readWorkspaceRevision = async (projectId: string) =>
  z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(await executeWorkspace(projectId, "git/revision"));

const invoke = async (
  projectId: string,
  name: WorkspaceToolName,
  args: unknown,
) => {
  switch (name) {
    case "readTerminalOutput": {
      workspaceTools.readTerminalOutput.schema.parse(args);
      const { projectTerminalSession } =
        await import("@/features/terminal/actions/terminal-session");
      const terminal = projectTerminalSession(projectId).getSnapshot();
      return {
        status: terminal.status,
        access: terminal.access,
        connectionMessage: terminal.error,
        output: terminal.output.slice(-8000),
        truncated: terminal.output.length > 8000,
        syncMessage: terminal.syncMessage,
      };
    }
    case "runTerminalCommand": {
      const input = workspaceTools.runTerminalCommand.schema.parse(args);
      const { projectTerminalSession } =
        await import("@/features/terminal/actions/terminal-session");
      const terminal = projectTerminalSession(projectId);
      const wasOpen = terminal.getSnapshot().status === "ready";
      try {
        const before = await terminal.sync();
        if (before.conflicts.length || before.failures.length)
          throw new Error(
            "Resolve workspace sync conflicts before running a terminal command.",
          );
        const result = await terminal.runCommand(
          input.command,
          input.timeout,
          before,
        );
        const sync = await terminal.sync();
        return {
          ...result,
          output: result.output.slice(-8000),
          truncated: result.output.length > 8000,
          conflicts: sync.conflicts,
          syncFailures: sync.failures,
          changedFiles: [...sync.downloadedPaths, ...sync.localDeletedPaths],
        };
      } finally {
        if (!wasOpen) terminal.disconnect();
      }
    }
    case "readFile": {
      const input = workspaceTools.readFile.schema.parse(args);
      const result = await file.readProjectFileContentAction(
        projectId,
        input.path,
      );
      if (!result) return null;
      const diagnostics = await collectFileDiagnostics(
        projectId,
        input.path,
        result.content,
      );
      const lines = result.content.split("\n");
      const response = {
        path: result.path,
        size: result.size,
        contentHash: bytesToHex(
          sha256(new TextEncoder().encode(result.content)),
        ),
        totalLines: lines.length,
        excerptTruncated:
          input.startLine > 1 ||
          lines.length > input.lineCount ||
          result.content.length > 8000,
        startLine: input.startLine,
        content: lines
          .slice(input.startLine - 1, input.startLine - 1 + input.lineCount)
          .join("\n")
          .slice(0, 8000),
        diagnostics,
      };
      // Preserve valid JSON, the original hash, and diagnostics when the full
      // response would otherwise be chopped by the generic tool-result limit.
      while (
        JSON.stringify(response).length > 10000 &&
        response.content.length
      ) {
        response.excerptTruncated = true;
        response.content = response.content.slice(
          0,
          Math.floor(response.content.length / 2),
        );
      }
      while (
        JSON.stringify(response).length > 10000 &&
        diagnostics.items.length
      ) {
        diagnostics.items.pop();
        diagnostics.truncated = true;
      }
      return response;
    }
    case "listFiles": {
      let failure: Error | undefined;
      const result = await file.readProjectFilesAction(
        projectId,
        workspaceTools.listFiles.schema.parse(args),
        undefined,
        undefined,
        (_status, _retryAfter, code, message) => {
          failure = new LocalWorkspaceError(
            code ?? "FILE_LIST_FAILED",
            message ?? "Unable to list this folder.",
          );
        },
      );
      if (failure) throw failure;
      return result;
    }
    case "searchFiles":
      return file.readProjectFilesAction(
        projectId,
        workspaceTools.searchFiles.schema.parse(args),
      );
    case "saveFile": {
      const input = workspaceTools.saveFile.schema.parse(args);
      const existing = await file.readProjectFileContentAction(
        projectId,
        input.path,
      );
      if (!existing) throw new Error("Read the file before replacing it.");
      if (existing.content.length > 8000)
        throw new Error(
          "Use editFile for this file so unread content is preserved.",
        );
      return file.saveProjectFileContentAction(projectId, input);
    }
    case "editFile": {
      const { path, oldText, newText, expectedContentHash } =
        workspaceTools.editFile.schema.parse(args);
      const existing = await file.readProjectFileContentAction(projectId, path);
      if (!existing) throw new Error("The file could not be read.");
      const start = existing.content.indexOf(oldText);
      if (start < 0 || start !== existing.content.lastIndexOf(oldText))
        throw new Error("Choose a unique exact excerpt from the current file.");
      return file.saveProjectFileContentAction(projectId, {
        path,
        expectedContentHash,
        content:
          existing.content.slice(0, start) +
          newText +
          existing.content.slice(start + oldText.length),
      });
    }
    case "createFile":
      return file.createProjectFileAction(
        projectId,
        workspaceTools.createFile.schema.parse(args),
      );
    case "renameFile":
      return file.updateProjectFileAction(
        projectId,
        workspaceTools.renameFile.schema.parse(args),
      );
    case "deleteFile":
      return file.deleteProjectFileAction(
        projectId,
        workspaceTools.deleteFile.schema.parse(args),
      );
    case "gitBranches":
      return git.readProjectBranchesAction(
        projectId,
        workspaceTools.gitBranches.schema.parse(args),
      );
    case "gitHistory":
      return git.readProjectCommitsAction(
        projectId,
        workspaceTools.gitHistory.schema.parse(args),
      );
    case "gitCommitDetails":
      return git.readProjectCommitDetailsAction(
        projectId,
        workspaceTools.gitCommitDetails.schema.parse(args),
      );
    case "gitStatus":
      return git.readProjectGitCountsAction(projectId);
    case "gitChanges":
      return git.readProjectChangesAction(projectId);
    case "gitCommit":
      return git.createProjectCommitAction(
        projectId,
        workspaceTools.gitCommit.schema.parse(args),
      );
    case "gitCheckout":
      return git.checkoutProjectBranchAction(
        projectId,
        workspaceTools.gitCheckout.schema.parse(args),
      );
    case "gitCreateBranch":
      return git.createProjectBranchAction(
        projectId,
        workspaceTools.gitCreateBranch.schema.parse(args),
      );
    case "gitDeleteBranch":
      return git.deleteProjectBranchAction(
        projectId,
        workspaceTools.gitDeleteBranch.schema.parse(args),
      );
    case "gitFetch":
      return git.fetchProjectGitAction(projectId);
    case "gitPush":
      return git.pushProjectGitAction(
        projectId,
        workspaceTools.gitPush.schema.parse(args),
      );
    case "gitPull":
      return git.pullProjectGitAction(
        projectId,
        workspaceTools.gitPull.schema.parse(args),
      );
    case "gitStashes":
      return git.readProjectStashesAction(
        projectId,
        workspaceTools.gitStashes.schema.parse(args),
      );
    case "gitStash":
      return git.stashProjectChangesAction(
        projectId,
        workspaceTools.gitStash.schema.parse(args),
      );
    case "gitApplyStash":
      return git.popProjectStashAction(
        projectId,
        workspaceTools.gitApplyStash.schema.parse(args),
      );
    case "gitDeleteStash":
      return git.deleteProjectStashAction(
        projectId,
        workspaceTools.gitDeleteStash.schema.parse(args),
      );
    case "gitDiscardPreview":
      return git.readProjectDiscardPreviewAction(projectId);
    case "gitDiscard":
      return git.discardProjectChangesAction(
        projectId,
        workspaceTools.gitDiscard.schema.parse(args),
      );
    case "gitUndo":
      return git.undoProjectCommitAction(
        projectId,
        workspaceTools.gitUndo.schema.parse(args),
      );
    case "gitRevert":
      return git.revertProjectCommitAction(
        projectId,
        workspaceTools.gitRevert.schema.parse(args),
      );
    case "publishRepository":
      return publish.publishProjectAction(
        projectId,
        workspaceTools.publishRepository.schema.parse(args),
      );
  }
};

export const executeDeviceTool = async (
  projectId: string,
  command: AgentCommandSchema,
): Promise<AgentToolResultSchema> => {
  if (!Object.hasOwn(workspaceTools, command.name))
    throw new Error("Unknown workspace tool.");
  const name = command.name as WorkspaceToolName;
  const definition = workspaceTools[name];
  definition.schema.parse(command.args);
  await editorPreferencesStore.load();
  const disabledText =
    editorPreferencesStore.getSnapshot().preferences.aiDisabledPaths;
  if (!pathRulesAreValid(disabledText))
    throw new Error(
      "Invalid Disabled Files / Folders list. Fix it in Editor Settings before using AI tools.",
    );
  const disabledPaths = parsePathRules(disabledText);
  assertWorkspaceToolAllowed(name, command.args, disabledPaths);
  const execute = async () => {
    const result = filterWorkspaceToolResult(
      name,
      await invoke(projectId, name, command.args),
      disabledPaths,
    );
    if (
      result === null ||
      result === undefined ||
      (typeof result === "object" && "error" in result && result.error)
    )
      throw new LocalWorkspaceError(
        result && "code" in result && typeof result.code === "string"
          ? result.code
          : "WORKSPACE_ACTION_FAILED",
        result && "message" in result
          ? String(result.message)
          : "The workspace action could not be completed.",
      );
    return result;
  };
  const completed =
    name === "runTerminalCommand"
      ? await (async () => {
          if ((await readWorkspaceRevision(projectId)) !== command.revision)
            throw new Error(
              "The workspace changed. Read it again before running a command.",
            );
          const result = await execute();
          return { result, revision: await readWorkspaceRevision(projectId) };
        })()
      : definition.mutation
        ? await withWorkspaceRevision(projectId, command.revision, execute)
        : { result: await execute(), revision: command.revision };
  const { result } = completed;
  const text = JSON.stringify(result);
  const changedFiles: string[] = [];
  if (
    ["saveFile", "editFile", "createFile", "renameFile", "deleteFile"].includes(
      name,
    ) &&
    result &&
    typeof result === "object" &&
    "data" in result &&
    result.data &&
    typeof result.data === "object" &&
    "path" in result.data
  ) {
    const path = projectFilePathSchema.safeParse(result.data.path);
    if (path.success) changedFiles.push(path.data);
  }
  if (
    name === "runTerminalCommand" &&
    result &&
    typeof result === "object" &&
    "changedFiles" in result &&
    Array.isArray(result.changedFiles)
  ) {
    for (const value of result.changedFiles) {
      const path = projectFilePathSchema.safeParse(value);
      if (path.success) changedFiles.push(path.data);
    }
  }
  return {
    ...(changedFiles.length ? { changedFiles } : {}),
    ok: true,
    text: text.slice(0, 10000),
    truncated: text.length > 10000,
    // Reads must not silently approve edits made while the task was thinking.
    revision: completed.revision,
  };
};
