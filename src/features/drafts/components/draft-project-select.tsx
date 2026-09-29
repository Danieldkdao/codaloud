import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";

import { ProjectIcon } from "@/components/project-icon";
import { SearchInput } from "@/components/search-input";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { formatProjectUpdatedDate } from "@/features/projects/lib/formatters";
import type {
  ProjectPageData,
  ProjectResponseData,
} from "@/features/projects/types";
import { cn } from "@/lib/utils";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";

const pageProjects = (page: ProjectPageData) => page.projects;
const projectKey = (project: ProjectResponseData) => project.id;

export type DraftProjectSelectProps = {
  selectedProjectId: string | null;
  onSelect: (project: ProjectResponseData) => void;
};

export const DraftProjectSelect = ({
  selectedProjectId,
  onSelect,
}: DraftProjectSelectProps) => {
  const [search, setSearch] = useState("");
  const {
    data,
    isPending,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProjects({ search });
  const projects = useUniquePaginatedItems(
    data?.pages,
    pageProjects,
    projectKey,
  );

  return (
    // A native boundary keeps the list inside its layout frame in nested iOS sheets.
    <View collapsable={false} className="min-h-0 shrink gap-3">
      {isError ? (
        <PText accessibilityRole="alert" className="text-destructive">
          {error.message}
        </PText>
      ) : null}
      <GlassSurface borderRadius={24}>
        <SearchInput
          initialSearch={search}
          onValueChange={setSearch}
          placeholder="Search projects…"
          parentClassName="rounded-full border-0 bg-transparent"
          inputClassName="bg-transparent"
        />
      </GlassSurface>
      <FlatList
        className="min-h-0"
        style={{ flexGrow: 0, flexShrink: 1, maxHeight: 420 }}
        data={projects}
        keyExtractor={(project) => project.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 10, paddingTop: 8, paddingBottom: 12 }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage)
            void fetchNextPage({ cancelRefetch: false });
        }}
        ListEmptyComponent={
          isPending ? (
            <View className="items-center gap-3 py-8">
              <ActivityIndicator className="text-primary" accessible={false} />
              <PText>Loading projects…</PText>
            </View>
          ) : (
            <View className="items-center gap-3 px-6 py-8">
              <HeadingText className="text-center text-2xl">
                No projects yet
              </HeadingText>
              <PText className="text-center">
                Create a project before copying a draft into it.
              </PText>
            </View>
          )
        }
        renderItem={({ item: project }) => {
          const selected = project.id === selectedProjectId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Copy into ${project.name}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(project)}
              className={cn(
                "flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80",
                selected && "border-primary",
              )}
            >
              <ProjectIcon name={project.name} isDirectory />
              <View className="min-w-0 flex-1 gap-1">
                <HeadingText
                  className="text-xl font-medium text-card-foreground"
                  numberOfLines={1}
                >
                  {project.name}
                </HeadingText>
                <PText className="text-base text-muted-foreground">
                  {formatProjectUpdatedDate(project.updatedAt)}
                </PText>
              </View>
              {selected ? (
                <Icon
                  family="Feather"
                  name="check"
                  size={22}
                  accessible={false}
                  className="text-primary"
                />
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
};
