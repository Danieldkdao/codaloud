import { Alert, Keyboard, View } from "react-native";
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { useProjectWorkspaceFileSearch } from "@/features/projects/hooks/use-project-workspace-file-search";
import { useProjectFileUpload } from "@/features/projects/hooks/use-project-file-upload";
import { useImportProjectFiles } from "@/features/projects/hooks/use-import-project-files";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";
import type { ProjectImportItem } from "@/features/projects/lib/file-imports";

/** Uploads never overwrite silently: the user decides, or nothing is written. */
const askUploadConflict = (
  conflicts: readonly string[],
  onReplace: () => void,
  onSkip: () => void,
) => {
  const summary =
    conflicts.length === 1
      ? `"${conflicts[0]}" already exists here.`
      : `${conflicts.length} uploaded files already exist here.`;
  Alert.alert(
    "Some files already exist",
    `${summary} What should Codaloud do?`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Skip them", onPress: onSkip },
      { text: "Replace", style: "destructive", onPress: onReplace },
    ],
  );
};

export const ProjectFilesAdd = () => {
  const creation = useProjectWorkspaceFileCreation();
  const { projectId, isWorkspaceBusy, runWorkspaceOperation } =
    useProjectWorkspaceBranch();
  const { setQuery, currentDirectory } = useProjectWorkspaceFileSearch();
  const upload = useProjectFileUpload();
  const importer = useImportProjectFiles(projectId);
  const showSuccess = useSuccessFeedback();
  const router = useRouter();
  const disabled =
    creation.kind !== null || isWorkspaceBusy || importer.isPending;

  const begin = (kind: ProjectFileKind) => {
    if (disabled) return;
    Keyboard.dismiss();
    // Creation belongs to the browsed folder, even when invoked from a preview
    // or search results. Reveal the browser before showing its inline form.
    setQuery("");
    creation.begin(kind);
    router.dismissTo({
      pathname: "/projects/[projectId]/files",
      params: { projectId },
    });
  };

  const importItems = useCallback(
    async (items: ProjectImportItem[], mode: "fail" | "replace" | "skip") => {
      await runWorkspaceOperation("Uploading files…", async (assertCurrent) => {
        assertCurrent();
        const result = await importer.mutateAsync({
          directoryPath: currentDirectory,
          items,
          mode,
        });
        assertCurrent();
        if (result.error) {
          if (result.code === "IMPORT_CONFLICT") {
            askUploadConflict(
              result.conflicts ?? [],
              () => void importItems(items, "replace"),
              () => void importItems(items, "skip"),
            );
            return;
          }
          Alert.alert("Couldn't upload these files", result.message);
          return;
        }
        upload.clear();
        if (result.data.imported.length > 0) showSuccess(result.message);
      });
    },
    [currentDirectory, importer, runWorkspaceOperation, showSuccess, upload],
  );

  const choose = async (load: () => Promise<ProjectImportItem[]>) => {
    if (disabled) return;
    setQuery("");
    router.dismissTo({
      pathname: "/projects/[projectId]/files",
      params: { projectId },
    });
    const items = await load();
    if (items.length === 0) return;
    await importItems(items, "fail");
  };

  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      accessibilityState={{ disabled }}
      className={cn(disabled && "opacity-50")}
    >
      <NativeSelect
        label="Add file or folder"
        trigger={
          <View className="size-14 items-center justify-center rounded-full">
            <Icon
              family="Feather"
              name="plus"
              size={22}
              accessible={false}
              className="text-foreground"
            />
          </View>
        }
        sections={[
          {
            label: "Create",
            value: creation.kind ?? "",
            options: [
              {
                value: "folder",
                label: "Folder",
                onSelect: () => begin("folder"),
              },
              { value: "file", label: "File", onSelect: () => begin("file") },
            ],
          },
          {
            label: "Upload",
            value: "",
            options: [
              {
                value: "upload-file",
                label: upload.isPicking ? "Choosing…" : "File from this device",
                onSelect: () => void choose(upload.pickFiles),
              },
              {
                value: "upload-folder",
                label: upload.isPicking
                  ? "Choosing…"
                  : "Folder from this device",
                onSelect: () => void choose(upload.pickFolder),
              },
            ],
          },
        ]}
      />
    </View>
  );
};
