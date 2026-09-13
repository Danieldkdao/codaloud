import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";
import { ProjectFileCreateRow } from "@/features/projects/components/project-file-create-row";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { formatProjectFileKind } from "@/features/projects/lib/formatters";
import { ProjectFilesList } from "@/features/projects/components/project-files-list";
import { ProjectFileSearchResults } from "@/features/projects/components/project-file-search-results";
import { useProjectWorkspaceFileSearch } from "@/features/projects/hooks/use-project-workspace-file-search";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";
import { useProjectFileSaveRegistry } from "@/features/projects/hooks/use-project-file-save";
import { getDirectoryFiles, isProjectFilePathWithin } from "@/features/projects/lib/files";

const FilesScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const currentFile = useProjectWorkspaceCurrentFile();
  const fileSearch = useProjectWorkspaceFileSearch();
  const saves = useProjectFileSaveRegistry();
  const [currentDirectory, setCurrentDirectory] = useState("");
  const { query, creation, update, deletion } = useProjectFiles(projectId, currentDirectory);
  const fileCreation = useProjectWorkspaceFileCreation();
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const showSuccess = useSuccessFeedback();
  const deletionInFlight = useRef(false);
  const renameInFlight = useRef(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const parentDirectory =
    currentDirectory === ""
      ? undefined
      : currentDirectory.slice(
          0,
          Math.max(0, currentDirectory.lastIndexOf("/")),
        );

  if (fileSearch.isSearching) {
    return <ProjectFileSearchResults key={`${fileSearch.query}:${fileSearch.scope}`} results={fileSearch.results} />;
  }

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
      {fileCreation.kind && !deletion.isPending && renamingPath === null && (
        <ProjectFileCreateRow
          key={`${projectId}/${currentDirectory}/${fileCreation.kind}`}
          kind={fileCreation.kind}
          existingNames={existingNames}
          parentPath={currentDirectory}
          onCancel={fileCreation.finish}
          onCreate={async (input) => {
            const createdFile = await creation.mutateAsync(input);
            currentFile.refreshFile(createdFile.path);
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
        onFilePress={(path) => {
          currentFile.setFilePath(path);
          router.navigate({ pathname: "/projects/[projectId]/code", params: { projectId } });
        }}
        onUpdate={async (input) => {
          if (renameInFlight.current) throw new Error("Another rename is in progress. Please try again.");
          renameInFlight.current = true;
          const previousPath = [input.parentPath, input.previousName].filter(Boolean).join("/");
          const nextPath = [input.parentPath, input.name].filter(Boolean).join("/");
          setRenamingPath(previousPath);
          try {
            const updatedFile = await saves.renameFiles(previousPath, nextPath, () => update.mutateAsync(input));
            currentFile.setFilePath((path) => path !== null && isProjectFilePathWithin(path, previousPath)
              ? updatedFile.path + path.slice(previousPath.length)
              : path);
            showSuccess(formatProjectFileKind(input.kind).updateSuccessMessage);
          } finally {
            renameInFlight.current = false;
            setRenamingPath(null);
          }
        }}
        onDelete={async (input) => {
          if (deletionInFlight.current || renameInFlight.current) return;
          deletionInFlight.current = true;
          try {
            const deletedFile = await deletion.mutateAsync(input);
            currentFile.setFilePath((path) => path !== null && isProjectFilePathWithin(path, deletedFile.path) ? null : path);
            showSuccess(formatProjectFileKind(input.kind).deleteSuccessMessage);
          } catch (error) {
            Alert.alert("Couldn't delete this item", error instanceof Error ? error.message : "Refresh the folder and try again.");
          } finally {
            deletionInFlight.current = false;
          }
        }}
        updatingPath={renamingPath ?? (update.isPending
          ? [update.variables.parentPath, update.variables.previousName].filter(Boolean).join("/")
          : undefined)}
        deletingPath={deletion.isPending
          ? [deletion.variables.parentPath, deletion.variables.name].filter(Boolean).join("/")
          : undefined}
        navigationDisabled={Boolean(fileCreation.kind) || deletion.isPending}
      />
    </View>
  );
};

export default FilesScreen;
