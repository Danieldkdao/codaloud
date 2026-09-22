import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import * as file from "@/features/projects/actions/file-actions";
import * as git from "@/features/projects/actions/git-actions";
import * as publish from "@/features/projects/actions/publish-actions";
import {
  executeWorkspace,
  withWorkspaceRevision,
} from "@/services/local-workspace/execute";
import { workspaceTools, type WorkspaceToolName } from "./workspace-tools";
import type { AgentCommandSchema, AgentToolResultSchema } from "../schemas";

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
    case "readFile": {
      const input = workspaceTools.readFile.schema.parse(args);
      const result = await file.readProjectFileContentAction(
        projectId,
        input.path,
      );
      if (!result) return null;
      const lines = result.content.split("\n");
      return {
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
      };
    }
    case "listFiles":
      return file.readProjectFilesAction(
        projectId,
        workspaceTools.listFiles.schema.parse(args),
      );
    case "searchFiles":
      return file.readProjectFilesAction(
        projectId,
        workspaceTools.searchFiles.schema.parse(args),
      );
    case "saveFile":
      return file.saveProjectFileContentAction(
        projectId,
        workspaceTools.saveFile.schema.parse(args),
      );
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
  const execute = async () => {
    const result = await invoke(projectId, name, command.args);
    if (
      result === null ||
      result === undefined ||
      (typeof result === "object" && "error" in result && result.error)
    )
      throw new Error(
        result && "message" in result
          ? String(result.message)
          : "The workspace action could not be completed.",
      );
    return result;
  };
  const completed = definition.mutation
    ? await withWorkspaceRevision(projectId, command.revision, execute)
    : { result: await execute(), revision: command.revision };
  const { result } = completed;
  const text = JSON.stringify(result);
  return {
    ok: true,
    text: text.slice(0, 10000),
    truncated: text.length > 10000,
    // Reads must not silently approve edits made while the task was thinking.
    revision: completed.revision,
  };
};
