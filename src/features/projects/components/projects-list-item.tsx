import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { deleteProjectAction } from "@/features/projects/actions/actions";
import { formatProjectSetupStatus } from "@/features/projects/lib/formatters";
import type { ProjectResponseData } from "@/features/projects/types";
import { alert, cn, confirmAction } from "@/lib/utils";

type ProjectsListItemProps = {
  project: ProjectResponseData;
};

export const ProjectsListItem = ({ project }: ProjectsListItemProps) => {
  const swipeable = useRef<SwipeableMethods>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
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

  const updateProject = () => {
    swipeable.current?.close();
    router.push({
      pathname: "/edit-project",
      params: { projectId: project.id },
    });
  };

  const deleteProject = () => {
    swipeable.current?.close();
    confirmAction(
      "Delete project?",
      `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
      {
        actionText: "Delete",
        onConfirmPress: async () => {
          const deletedProject = await deleteProjectAction(project.id);

          if (deletedProject.error) {
            alert(`Error: ${deletedProject.message}`);
            return;
          }

          void queryClient.invalidateQueries({ queryKey: ["projects"] });
        },
      },
    );
  };

  return (
    <Swipeable
      ref={swipeable}
      friction={2}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={{ borderRadius: 16 }}
      onSwipeableWillOpen={() => setActionsVisible(true)}
      onSwipeableWillClose={() => setActionsVisible(false)}
      renderRightActions={() => (
        <View
          className="h-full flex-row items-stretch gap-2 pl-2"
          accessibilityElementsHidden={!actionsVisible}
          importantForAccessibility={
            actionsVisible ? "auto" : "no-hide-descendants"
          }
        >
          <Button
            variant="outline"
            className="h-full min-h-0 aspect-square shrink-0 rounded-2xl p-0"
            accessibilityLabel={`Update ${project.name}`}
            onPress={updateProject}
          >
            <Icon
              family="Feather"
              name="edit-2"
              size={22}
              className="text-foreground"
              accessible={false}
            />
          </Button>
          <Button
            variant="destructive"
            className="h-full min-h-0 aspect-square shrink-0 rounded-2xl p-0"
            accessibilityLabel={`Delete ${project.name}`}
            onPress={deleteProject}
          >
            <Icon
              family="Feather"
              name="trash-2"
              size={22}
              className="text-destructive"
              accessible={false}
            />
          </Button>
        </View>
      )}
    >
      <Link
        href={{
          pathname: "/projects/[projectId]",
          params: { projectId: project.id },
        }}
        asChild
      >
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
          accessibilityHint="Open project. Swipe left for Update and Delete."
          accessibilityActions={[
            { name: "update", label: "Update project" },
            { name: "delete", label: "Delete project" },
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === "update") updateProject();
            if (nativeEvent.actionName === "delete") deleteProject();
          }}
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
      </Link>
    </Swipeable>
  );
};
