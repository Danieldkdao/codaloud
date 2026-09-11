import { useLocalSearchParams } from "expo-router";
import { use, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { useSuccessFeedback } from "@/components/success-feedback-provider";
import { ProjectFileCreateRow } from "@/features/projects/components/project-file-create-row";
import { ProjectWorkspaceDockHeightContext, ProjectWorkspaceFileCreationContext } from "@/features/projects/contexts/project-workspace-context";
import { formatProjectFileKind } from "@/features/projects/lib/formatters";
import { ProjectFilesList } from "@/features/projects/components/project-files-list";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";
import { getDirectoryFiles } from "@/features/projects/lib/files";

const FilesScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [currentDirectory, setCurrentDirectory] = useState("");
  const { query, creation, update, deletion } = useProjectFiles(projectId, currentDirectory);
  const fileCreation = use(ProjectWorkspaceFileCreationContext);
  const dockHeight = use(ProjectWorkspaceDockHeightContext);
  const showSuccess = useSuccessFeedback();
  const deletionInFlight = useRef(false);
  const parentDirectory =
    currentDirectory === ""
      ? undefined
      : currentDirectory.slice(
          0,
          Math.max(0, currentDirectory.lastIndexOf("/")),
        );

  if (query.isPending) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        style={{ marginBottom: dockHeight }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading files"
        accessibilityState={{ busy: true }}
      >
        <ActivityIndicator size="large" className="text-primary" accessible={false} />
      </View>
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
      {fileCreation?.kind && !deletion.isPending && (
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
        onDelete={async (input) => {
          if (deletionInFlight.current) return;
          deletionInFlight.current = true;
          try {
            await deletion.mutateAsync(input);
            showSuccess(formatProjectFileKind(input.kind).deleteSuccessMessage);
          } catch (error) {
            Alert.alert("Couldn't delete this item", error instanceof Error ? error.message : "Refresh the folder and try again.");
          } finally {
            deletionInFlight.current = false;
          }
        }}
        updatingPath={update.isPending
          ? [update.variables.parentPath, update.variables.previousName].filter(Boolean).join("/")
          : undefined}
        deletingPath={deletion.isPending
          ? [deletion.variables.parentPath, deletion.variables.name].filter(Boolean).join("/")
          : undefined}
        navigationDisabled={Boolean(fileCreation?.kind) || deletion.isPending}
      />
    </View>
  );
};

export default FilesScreen;
