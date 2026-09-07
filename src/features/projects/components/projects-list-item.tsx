import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import type { ProjectResponseData } from "@/features/projects/types";
import { cn } from "@/lib/utils";

type ProjectsListItemProps = {
  project: ProjectResponseData;
};

const setupStatuses = {
  pending: {
    label: "Queued",
    className: "bg-muted",
    textClassName: "text-muted-foreground",
  },
  running: {
    label: "Setting up",
    className: "bg-secondary",
    textClassName: "text-secondary-foreground",
  },
  ready: {
    label: "Ready",
    className: "bg-secondary",
    textClassName: "text-secondary-foreground",
  },
  failed: {
    label: "Setup failed",
    className: "bg-destructive/10",
    textClassName: "text-destructive",
  },
} satisfies Record<
  ProjectResponseData["setupStatus"],
  {
    label: string;
    className: string;
    textClassName: string;
  }
>;

export const ProjectsListItem = ({ project }: ProjectsListItemProps) => {
  const status = setupStatuses[project.setupStatus];
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
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${project.name}, ${status.label}, ${updatedLabel}`}
        accessibilityHint="Open project"
        className="gap-4 rounded-2xl border border-border bg-card p-4 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <View className="flex-row items-center gap-3">
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
                name="folder"
                size={24}
                className="text-secondary-foreground"
                accessible={false}
              />
            )}
          </View>
          <View className="min-w-0 flex-1">
            <HeadingText
              className="text-xl font-medium text-card-foreground"
              numberOfLines={2}
            >
              {project.name}
            </HeadingText>
            <PText className="text-muted-foreground text-lg font-medium">
              {updatedLabel}
            </PText>
          </View>
          <View className={cn("rounded-full px-3 py-1", status.className)}>
            <PText className={status.textClassName}>{status.label}</PText>
          </View>
        </View>
      </Pressable>
    </Link>
  );
};
