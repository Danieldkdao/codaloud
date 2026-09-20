import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";
import { ProjectFileCreateSheet } from "@/features/projects/components/project-file-create-sheet";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { formatProjectFileKind } from "@/features/projects/lib/formatters";
import { ProjectFilesList } from "@/features/projects/components/project-files-list";
import { ProjectFileSearchResults } from "@/features/projects/components/project-file-search-results";
import { useProjectWorkspaceFileSearch } from "@/features/projects/hooks/use-project-workspace-file-search";
import { useProjectFiles } from "@/features/projects/hooks/use-project-files";
import { useProjectFileSearch } from "@/features/projects/hooks/use-project-file-search";
import { useProjectFileSaveRegistry } from "@/features/projects/hooks/use-project-file-save";
import { getDirectoryFiles } from "@/features/projects/lib/files";

const FilesScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const currentFile = useProjectWorkspaceCurrentFile();
  const fileSearch = useProjectWorkspaceFileSearch();
  const workspace = useProjectWorkspaceBranch();
  const saves = useProjectFileSaveRegistry();
  const { currentDirectory, setCurrentDirectory } = fileSearch;
  const { query, creation, update, deletion } = useProjectFiles(
    projectId,
    currentDirectory,
    { enabled: !fileSearch.isSearching },
  );
  const isDebouncing = fileSearch.query !== fileSearch.debouncedQuery;
  const searchPath = fileSearch.isCurrentFolderScoped ? currentDirectory : "";
  const search = useProjectFileSearch(projectId, {
    // Changing the key to an empty search also cancels any obsolete request.
    search: isDebouncing ? "" : fileSearch.debouncedQuery,
    scope: fileSearch.scope,
    path: searchPath,
    enabled: fileSearch.isSearching && !isDebouncing,
  });
  const searchResults = useMemo(
    () => search.data?.pages.flatMap((page) => page.files) ?? [],
    [search.data],
  );
  const fileCreation = useProjectWorkspaceFileCreation();
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const showSuccess = useSuccessFeedback();
  const deletionInFlight = useRef(false);
  const renameInFlight = useRef(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const openFile = (path: string) => {
    currentFile.openFile(path);
    router.dismissTo({
      pathname: "/projects/[projectId]/code",
      params: { projectId },
    });
  };
  const parentDirectory =
    currentDirectory === ""
      ? undefined
      : currentDirectory.slice(
          0,
          Math.max(0, currentDirectory.lastIndexOf("/")),
        );

  if (fileSearch.isSearching) {
    const canFetch =
      !search.validationError &&
      !isDebouncing &&
      !search.isFetching &&
      search.fetchStatus !== "paused";
    return (
      <ProjectFileSearchResults
        key={`${projectId}:${fileSearch.query}:${fileSearch.scope}:${searchPath}`}
        query={fileSearch.query}
        scope={fileSearch.scope}
        results={searchResults}
        totalCount={search.data?.pages[0]?.totalCount ?? 0}
        // Every page repeats snapshot-wide coverage; use it once, not a sum.
        skippedContentFiles={search.data?.pages[0]?.skippedContentFiles ?? 0}
        isLoading={
          !search.validationError && (isDebouncing || search.isPending)
        }
        isFetching={search.isFetching}
        isFetchingNextPage={search.isFetchingNextPage}
        isPaused={search.fetchStatus === "paused"}
        error={search.validationError ?? search.error?.message}
        onFilePress={(filePath) =>
          router.push({
            pathname: "/projects/[projectId]/files/preview",
            params: {
              projectId,
              filePath,
              ...(fileSearch.scope === "title"
                ? {}
                : { search: fileSearch.debouncedQuery }),
            },
          })
        }
        onLoadMore={() => {
          if (canFetch && search.hasNextPage && !search.error)
            void search.fetchNextPage({ cancelRefetch: false });
        }}
        onRefresh={() => {
          if (canFetch) void search.refetch();
        }}
        onRetry={
          search.validationError
            ? undefined
            : () => {
                if (!canFetch) return;
                if (search.isFetchNextPageError)
                  void search.fetchNextPage({ cancelRefetch: false });
                else void search.refetch();
              }
        }
      />
    );
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
        <ActivityIndicator
          size="large"
          className="text-primary"
          accessible={false}
        />
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
        <ProjectFileCreateSheet
          key={`${projectId}/${currentDirectory}/${fileCreation.kind}`}
          disabled={workspace.isWorkspaceBusy}
          kind={fileCreation.kind}
          existingNames={existingNames}
          parentPath={currentDirectory}
          onCancel={fileCreation.finish}
          onCreate={async (input) => {
            await workspace.runWorkspaceOperation(
              "Creating file…",
              async (assertCurrent) => {
                assertCurrent();
                const createdFile = await creation.mutateAsync(input);
                assertCurrent();
                currentFile.refreshFile(createdFile.path);
                fileCreation.finish();
                showSuccess(formatProjectFileKind(input.kind).successMessage);
              },
            );
          }}
        />
      )}
      <ProjectFilesList
        key={currentDirectory}
        files={directoryFiles}
        existingNames={existingNames}
        parentDirectory={parentDirectory}
        onDirectoryPress={setCurrentDirectory}
        onFilePress={openFile}
        onUpdate={async (input) => {
          if (renameInFlight.current)
            throw new Error("Another rename is in progress. Please try again.");
          renameInFlight.current = true;
          const previousPath = [input.parentPath, input.previousName]
            .filter(Boolean)
            .join("/");
          const nextPath = [input.parentPath, input.name]
            .filter(Boolean)
            .join("/");
          setRenamingPath(previousPath);
          try {
            await workspace.runWorkspaceOperation(
              "Renaming file…",
              async (assertCurrent) => {
                const updatedFile = await saves.renameFiles(
                  previousPath,
                  nextPath,
                  () => {
                    assertCurrent();
                    return update.mutateAsync(input);
                  },
                );
                assertCurrent();
                currentFile.renameFiles(previousPath, updatedFile.path);
                showSuccess(
                  formatProjectFileKind(input.kind).updateSuccessMessage,
                );
              },
            );
          } finally {
            renameInFlight.current = false;
            setRenamingPath(null);
          }
        }}
        onDelete={async (input) => {
          if (deletionInFlight.current || renameInFlight.current) return;
          deletionInFlight.current = true;
          try {
            await workspace.runWorkspaceOperation(
              "Deleting file…",
              async (assertCurrent) => {
                assertCurrent();
                await saves.withSavedFiles(async () => {
                  assertCurrent();
                  const deletedFile = await deletion.mutateAsync(input);
                  assertCurrent();
                  saves.invalidateFiles(deletedFile.path);
                  currentFile.removeFiles(deletedFile.path);
                });
                showSuccess(
                  formatProjectFileKind(input.kind).deleteSuccessMessage,
                );
              },
            );
          } catch (error) {
            Alert.alert(
              "Couldn't delete this item",
              error instanceof Error
                ? error.message
                : "Refresh the folder and try again.",
            );
          } finally {
            deletionInFlight.current = false;
          }
        }}
        updatingPath={
          renamingPath ??
          (update.isPending
            ? [update.variables.parentPath, update.variables.previousName]
                .filter(Boolean)
                .join("/")
            : undefined)
        }
        deletingPath={
          deletion.isPending
            ? [deletion.variables.parentPath, deletion.variables.name]
                .filter(Boolean)
                .join("/")
            : undefined
        }
        navigationDisabled={
          workspace.isWorkspaceBusy ||
          Boolean(fileCreation.kind) ||
          deletion.isPending
        }
      />
    </View>
  );
};

export default FilesScreen;
