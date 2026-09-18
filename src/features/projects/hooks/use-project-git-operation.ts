import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useDeviceWorkspace } from "@/features/workspace/hooks/use-device-workspace";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";
import { useTextPrompt } from "@/hooks/use-text-prompt";
import { useProjectWorkspaceBranch } from "./use-project-workspace-branch";
import { useProjectFileSaveRegistry } from "./use-project-file-save";
import { useProjectWorkspaceCurrentFile } from "./use-project-workspace-current-file";
import { ProjectGitError } from "../lib/git-errors";

export const useProjectGitOperation = () => {
  const router = useRouter();
  const workspace = useProjectWorkspaceBranch();
  const { withSavedFiles } = useProjectFileSaveRegistry();
  const currentFile = useProjectWorkspaceCurrentFile();
  const selectedFile = useRef(currentFile);
  selectedFile.current = currentFile;
  const client = useQueryClient();
  const device = useDeviceWorkspace();
  const userId = device.workspace?.ownerId;
  const showSuccess = useSuccessFeedback();
  const lifetime = useRef<AbortController | null>(null);
  const textPrompt = useTextPrompt();
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [userId, workspace.projectId]);

  const confirm = (
    title: string,
    message: string,
    actionText: string,
    destructive = false,
    cancelText = "Cancel",
  ) =>
    new Promise<boolean>((resolve) => {
      const signal = lifetime.current?.signal;
      if (!signal || signal.aborted) {
        resolve(false);
        return;
      }
      const finish = (confirmed: boolean) => {
        signal.removeEventListener("abort", cancel);
        resolve(confirmed && !signal.aborted);
      };
      const cancel = () => finish(false);
      signal.addEventListener("abort", cancel, { once: true });
      Alert.alert(
        title,
        message,
        [
          { text: cancelText, style: "cancel", onPress: cancel },
          {
            text: actionText,
            style: destructive ? "destructive" : "default",
            onPress: () => finish(true),
          },
        ],
        { cancelable: true, onDismiss: cancel },
      );
    });

  const run = async <T>(
    label: string,
    action: (assertCurrent: () => void) => Promise<T>,
    options: {
      success?: (result: T) => string | null;
      changesFiles?: boolean;
    } = {},
  ) => {
    const signal = lifetime.current?.signal;
    const assertCurrent = () => {
      workspace.assertWorkspaceCurrent();
      if (!signal || signal.aborted)
        throw new Error("The workspace has changed. Try again.");
    };
    try {
      return await workspace.runWorkspaceOperation(label, async () => {
        assertCurrent();
        if (
          client.isMutating({
            predicate: ({ options: mutation }) => {
              const key = mutation.mutationKey;
              return (
                key?.[0] === "projects" &&
                key[1] === "files" &&
                key[3] === userId &&
                key[4] === workspace.projectId
              );
            },
          })
        )
          throw new Error(
            "Wait for the file operation to finish, then try again.",
          );
        return withSavedFiles(async () => {
          assertCurrent();
          try {
            const result = await action(assertCurrent);
            assertCurrent();
            const message = options.success?.(result);
            if (message) showSuccess(message);
            return result;
          } finally {
            // Pull, discard, stash and history changes can replace file contents even
            // on conflicts. Remount the editor from confirmed local file contents afterward.
            if (options.changesFiles) {
              workspace.assertWorkspaceCurrent();
              await client.resetQueries({
                queryKey: ["projects", "file", userId, workspace.projectId],
              });
              workspace.assertWorkspaceCurrent();
              const file = selectedFile.current;
              file.refreshFiles();
            }
          }
        });
      });
    } catch (error) {
      if (!signal?.aborted && error instanceof ProjectGitError && error.code === "GITHUB_RECONNECT_REQUIRED") {
        Alert.alert("Connect GitHub", "GitHub is optional. Connect it in Settings to fetch, pull, or push repositories.", [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => { if (!signal?.aborted) router.push("/account"); } },
        ]);
        return undefined;
      }
      if (!signal?.aborted)
        Alert.alert(
          "Git operation failed",
          error instanceof Error
            ? error.message
            : "Refresh the workspace and try again.",
        );
      return undefined;
    }
  };
  return {
    ...workspace,
    run,
    confirm,
    textPrompt: textPrompt.props,
    promptText: (options: Parameters<typeof textPrompt.prompt>[0]) =>
      textPrompt.prompt(options, lifetime.current?.signal),
  };
};
