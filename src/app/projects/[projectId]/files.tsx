import { useLocalSearchParams } from "expo-router";
import { use, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { useSuccessFeedback } from "@/components/success-feedback-provider";
import { ProjectFileCreateRow } from "@/features/projects/components/project-file-create-row";
import { ProjectWorkspaceFileCreationContext } from "@/features/projects/contexts/project-workspace-context";
import { formatProjectFileKind } from "@/features/projects/lib/formatters";
import { ProjectFilesList } from "@/features/projects/components/project-files-list";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";
import { getDirectoryFiles } from "@/features/projects/lib/files";

const FilesScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [currentDirectory, setCurrentDirectory] = useState("");
  const { query, creation, update } = useProjectFiles(projectId, currentDirectory);
  const fileCreation = use(ProjectWorkspaceFileCreationContext);
  const showSuccess = useSuccessFeedback();
  const parentDirectory =
    currentDirectory === ""
      ? undefined
      : currentDirectory.slice(
          0,
          Math.max(0, currentDirectory.lastIndexOf("/")),
        );

  if (query.isPending) {
    return (
      <ProjectWorkspaceState
        title="Opening files…"
        description="Connecting to your workspace."
        icon="code"
        isLoading
      />
    );
  }

  if (query.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <HeadingText className="text-center text-2xl font-semibold">
          An error occurred
        </HeadingText>
        <PText accessibilityRole="alert" className="text-center max-w-100">
          {query.error.message}
        </PText>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onPress={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Try again"}
        </Button>
        {parentDirectory !== undefined && (
          <Button
            variant="ghost"
            onPress={() => setCurrentDirectory(parentDirectory)}
          >
            Go to parent folder
          </Button>
        )}
      </View>
    );
  }

  const directoryFiles = getDirectoryFiles(query.data ?? [], currentDirectory);
  const existingNames = directoryFiles.map((file) => file.name);

  return (
    <View className="flex-1 bg-background">
      {fileCreation?.kind && (
        <ProjectFileCreateRow
          key={`${projectId}/${currentDirectory}/${fileCreation.kind}`}
          kind={fileCreation.kind}
          existingNames={existingNames}
          parentPath={currentDirectory}
          onCancel={fileCreation.finish}
          onCreate={async (input) => {
            await creation.mutateAsync(input);
            fileCreation.finish();
            showSuccess(formatProjectFileKind(input.kind).successMessage);
          }}
        />
      )}
      <ProjectFilesList
        key={currentDirectory}
        files={directoryFiles}
        existingNames={existingNames}
        parentDirectory={parentDirectory}
        onDirectoryPress={setCurrentDirectory}
        onUpdate={async (input) => {
          await update.mutateAsync(input);
          showSuccess(formatProjectFileKind(input.kind).updateSuccessMessage);
        }}
        updatingPath={update.isPending
          ? [update.variables.parentPath, update.variables.previousName].filter(Boolean).join("/")
          : undefined}
        navigationDisabled={Boolean(fileCreation?.kind)}
      />
    </View>
  );
};

export default FilesScreen;
