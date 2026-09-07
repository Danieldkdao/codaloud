import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { formatProjectSetupStatus } from "@/features/projects/lib/formatters";
import type { ProjectResponseData } from "@/features/projects/types";
import { cn } from "@/lib/utils";

type ProjectsListItemProps = {
  project: ProjectResponseData;
};

export const ProjectsListItem = ({ project }: ProjectsListItemProps) => {
  const status = formatProjectSetupStatus(project.setupStatus);
  const sourceLabel = project.githubRepositoryId ? "GitHub import" : null;
  const updatedAt = new Date(project.updatedAt);
  const updatedLabel = Number.isNaN(updatedAt.getTime())
    ? "Update date unavailable"
    : `Updated ${updatedAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;

  return (
    <Link
      href={{
        pathname: "/projects/[projectId]",
        params: { projectId: project.id },
      }}
      asChild
    >
      <Link.Trigger>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={[
            project.name,
            sourceLabel,
            status.label,
            updatedLabel,
          ]
            .filter(Boolean)
            .join(", ")}
          accessibilityHint="Open project"
          className="gap-4 rounded-2xl border border-border bg-card p-4 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <View className="flex-row items-start gap-3">
            <View className="size-12 items-center justify-center rounded-xl bg-secondary">
              {project.githubRepositoryId ? (
                <Icon
                  family="FontAwesome"
                  name="github"
                  size={24}
                  className="text-secondary-foreground"
                  accessible={false}
                />
              ) : (
                <Icon
                  family="Feather"
                  name="code"
                  size={24}
                  className="text-secondary-foreground"
                  accessible={false}
                />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <HeadingText
                className="text-xl font-medium text-card-foreground"
                numberOfLines={1}
              >
                {project.name}
              </HeadingText>
              <PText className="text-muted-foreground text-lg">
                {updatedLabel}
              </PText>
              {sourceLabel && (
                <View className="items-center flex-row gap-2">
                  <Icon
                    family="Feather"
                    name="corner-down-right"
                    className="text-muted-foreground"
                    size={16}
                  />
                  <PText className="text-lg text-muted-foreground">
                    {sourceLabel}
                  </PText>
                </View>
              )}
            </View>
            <View className={cn("rounded-full px-3 py-1", status.className)}>
              <PText className={status.textClassName}>{status.label}</PText>
            </View>
          </View>
        </Pressable>
      </Link.Trigger>
      {/* Preview only: menu actions intentionally have no handlers yet. */}
      <Link.Menu>
        <Link.MenuAction icon="square.and.pencil">Edit project</Link.MenuAction>
        <Link.MenuAction icon="trash" destructive>
          Delete project
        </Link.MenuAction>
      </Link.Menu>
    </Link>
  );
};
