import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { CodeEditorLoading } from "@/components/code-editor-loading";
import { ProjectIcon } from "@/components/project-icon";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";
import { useProjectFile } from "@/features/projects/hooks/use-project-file";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { ProjectFilePreviewContent } from "@/features/projects/components/project-file-preview-content";
import { projectFileSearchQuerySchema } from "@/features/projects/actions/file-search-schemas";

const FilePreviewScreen = () => {
  const { projectId, filePath: pathParam, search: searchParam } = useLocalSearchParams<{
    projectId: string;
    filePath?: string | string[];
    search?: string | string[];
  }>();
  const parsedSearch = projectFileSearchQuerySchema.shape.search.safeParse(searchParam);
  const search = parsedSearch.success ? parsedSearch.data : null;
  const parsedPath = projectFilePathSchema.safeParse(pathParam);
  const filePath = parsedPath.success ? parsedPath.data : null;
  const query = useProjectFile(projectId, filePath, { freshOnMount: true });
  const currentFile = useProjectWorkspaceCurrentFile();
  const router = useRouter();
  const { dockHeight } = useProjectWorkspaceDockHeight();

  return (
    <View className="flex-1 bg-background">
      <View className="min-h-18 flex-row items-center gap-3 border-b border-border px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Back to files"
          onPress={() => router.dismissTo({
            pathname: "/projects/[projectId]/files",
            params: { projectId },
          })}
        >
          <Icon family="Feather" name="chevron-left" size={22} accessible={false} className="text-foreground" />
        </Button>
        {filePath ? <ProjectIcon name={filePath} isDirectory={false} /> : null}
        <View className="min-w-0 flex-1">
          <PText className="text-lg font-medium text-foreground" numberOfLines={1} ellipsizeMode="middle">
            {filePath ?? "File preview"}
          </PText>
        </View>
        {query.isFetching && query.data ? <ActivityIndicator className="text-muted-foreground" accessibilityLabel="Refreshing file" /> : null}
        <Icon family="Feather" name="lock" size={18} accessible accessibilityLabel="Read-only preview" className="text-muted-foreground" />
      </View>
      <View className="flex-1">
        {!filePath ? (
          <View className="flex-1 items-center justify-center gap-3 px-6" style={{ paddingBottom: dockHeight }}>
            <HeadingText className="text-center text-2xl">No file selected</HeadingText>
            <PText className="text-center">Return to Files and choose a search result to preview.</PText>
          </View>
        ) : query.fetchStatus === "paused" ? (
          <View className="flex-1 items-center justify-center px-6" style={{ paddingBottom: dockHeight }}>
            <PText className="text-center" accessibilityLiveRegion="polite">Reconnect to the internet to load this file.</PText>
          </View>
        ) : query.isError ? (
          <View className="flex-1 items-center justify-center gap-4 px-6" style={{ paddingBottom: dockHeight }}>
            <HeadingText className="text-center text-2xl">Couldn't open this file</HeadingText>
            <PText accessibilityRole="alert" className="text-center">{query.error.message}</PText>
            <Button variant="outline" disabled={query.isFetching} onPress={() => void query.refetch()}>
              {query.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </View>
        ) : query.data ? (
          <ProjectFilePreviewContent
            key={JSON.stringify([projectId, filePath, search])}
            filePath={filePath}
            content={query.data.content}
            search={search}
            dockHeight={dockHeight}
            onOpen={() => {
              currentFile.openFile(filePath);
              router.navigate({ pathname: "/projects/[projectId]/code", params: { projectId } });
            }}
          />
        ) : <CodeEditorLoading bottomInset={dockHeight} />}
      </View>

    </View>
  );
};

export default FilePreviewScreen;
