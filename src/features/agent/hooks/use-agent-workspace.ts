import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useProjectFileSaveRegistry } from "@/features/projects/hooks/use-project-file-save";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { readProjectGitCountsAction } from "@/features/projects/actions/git-actions";
import { workspaceTools } from "../tools/workspace-tools";
import { registerAgentMutation } from "../workspace-access";

export const AgentWorkspaceBridge = () => {
  const workspace = useProjectWorkspaceBranch();
  const saves = useProjectFileSaveRegistry();
  const files = useProjectWorkspaceCurrentFile();
  const client = useQueryClient();
  const current = useRef({ workspace, saves, files });
  current.current = { workspace, saves, files };
  useEffect(
    () =>
      registerAgentMutation(workspace.projectId, async (action, command) => {
        const owner = current.current;
        return owner.workspace.runWorkspaceOperation(
          "Agent action",
          async (assertCurrent) => {
            if (
              client.isMutating({
                predicate: ({ options }) =>
                  options.mutationKey?.[0] === "projects" &&
                  options.mutationKey.includes(workspace.projectId),
              })
            )
              throw new Error("Wait for the current file operation to finish.");
            const execute = async () => {
              if (command?.name === "renameFile") {
                const { parentPath, previousName, name } =
                  workspaceTools.renameFile.schema.parse(command.args);
                const prefix = parentPath ? `${parentPath}/` : "";
                return owner.saves.renameFiles(
                  prefix + previousName,
                  prefix + name,
                  action,
                );
              }
              return owner.saves.withSavedFiles(action);
            };
            return (async () => {
              assertCurrent();
              try {
                const result = await execute();
                assertCurrent();
                if (command?.name === "renameFile") {
                  const { parentPath, previousName, name } =
                    workspaceTools.renameFile.schema.parse(command.args);
                  const prefix = parentPath ? `${parentPath}/` : "";
                  owner.files.renameFiles(prefix + previousName, prefix + name);
                } else if (command?.name === "deleteFile") {
                  const { parentPath, name } =
                    workspaceTools.deleteFile.schema.parse(command.args);
                  owner.files.removeFiles(
                    parentPath ? `${parentPath}/${name}` : name,
                  );
                }
                return result;
              } finally {
                // Partial Git failures can change files too. The existing registry
                // retains protected late drafts across this confirmed-file refresh.
                assertCurrent();
                await client.resetQueries({
                  queryKey: ["projects", "file", workspace.projectId],
                });
                assertCurrent();
                owner.files.refreshFiles();
                const counts = await readProjectGitCountsAction(
                  workspace.projectId,
                );
                assertCurrent();
                if (counts?.currentBranch)
                  owner.workspace.setBranch(counts.currentBranch);
                void client.invalidateQueries({ queryKey: ["projects"] });
              }
            })();
          },
        );
      }),
    [workspace.projectId, client],
  );
  return null;
};
