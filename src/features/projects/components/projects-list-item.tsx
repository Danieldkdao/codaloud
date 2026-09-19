import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { Button } from "@/components/ui/button";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { deleteProjectAction } from "@/features/projects/actions/actions";
import {
  formatProjectSetupStatus,
  formatProjectUpdatedDate,
} from "@/features/projects/lib/formatters";
import type {
  ProjectPageData,
  ProjectResponseData,
} from "@/features/projects/types";
import { alert, cn, confirmAction } from "@/lib/utils";

type ProjectsListItemProps = {
  project: ProjectResponseData;
};

export const ProjectsListItem = ({ project }: ProjectsListItemProps) => {
  const showSuccess = useSuccessFeedback();
  const swipeable = useRef<SwipeableMethods>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);
  const [deletionAccepted, setDeletionAccepted] = useState(false);
  const isDeleting =
    isSubmittingDeletion ||
    deletionAccepted ||
    Boolean(project.deletionRequested);
  const deletionInFlight = useRef(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const status = formatProjectSetupStatus(project.setupStatus);
  const sourceLabel = project.githubRepositoryId ? "GitHub import" : null;
  const updatedLabel = formatProjectUpdatedDate(project.updatedAt);

  const updateProject = () => {
    if (deletionInFlight.current || isDeleting) return;
    swipeable.current?.close();
    router.push({
      pathname: "/edit-project",
      params: { projectId: project.id },
    });
  };

  const deleteProject = () => {
    if (deletionInFlight.current || isDeleting) return;
    swipeable.current?.close();
    confirmAction(
      "Delete project?",
      `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
      {
        actionText: "Delete",
        onConfirmPress: async () => {
          // Lock synchronously so repeated confirmations cannot start another request.
          if (deletionInFlight.current || isDeleting) return;
          deletionInFlight.current = true;
          setIsSubmittingDeletion(true);
          swipeable.current?.close();
          let accepted = false;
          try {
            const requestedProject = await deleteProjectAction(project.id);

            if (requestedProject.error) {
              alert(`Error: ${requestedProject.message}`);
              return;
            }

            accepted = true;
            setDeletionAccepted(true);
            const listFilters = {
              queryKey: ["projects", "infinite", "cursor"],
            };
            await queryClient.cancelQueries(listFilters);
            // Preserve accepted deletion across failed refreshes and list remounts.
            queryClient.setQueriesData<InfiniteData<ProjectPageData>>(
              listFilters,
              (data) =>
                data && {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    projects: page.projects.map((item) =>
                      item.id === project.id
                        ? { ...item, deletionRequested: true }
                        : item,
                    ),
                  })),
                },
            );
            // Acceptance starts background cleanup; only a refreshed list can remove the card.
            await queryClient.invalidateQueries({ queryKey: ["projects"] });
            showSuccess("Deletion started");
          } catch {
            alert("Error: Unable to delete project. Please try again.");
          } finally {
            deletionInFlight.current = accepted;
            setIsSubmittingDeletion(false);
          }
        },
      },
    );
  };

  return (
    <View className="relative">
      <View
        pointerEvents={isDeleting ? "none" : "auto"}
        accessibilityElementsHidden={isDeleting}
        importantForAccessibility={isDeleting ? "no-hide-descendants" : "auto"}
      >
        <Swipeable
          ref={swipeable}
          enabled={!isDeleting}
          friction={2}
          rightThreshold={48}
          overshootLeft={false}
          overshootRight={false}
          containerStyle={{ borderRadius: 16 }}
          onSwipeableWillOpen={() => setActionsVisible(true)}
          onSwipeableWillClose={() => setActionsVisible(false)}
          renderRightActions={() => (
            <View
              className="h-full flex-row items-stretch"
              accessibilityElementsHidden={!actionsVisible}
              importantForAccessibility={
                actionsVisible ? "auto" : "no-hide-descendants"
              }
            >
              <Button
                variant="secondary"
                className="h-full min-h-0 aspect-square shrink-0 rounded-none p-0"
                accessibilityLabel={`Update ${project.name}`}
                disabled={isDeleting}
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
                className="h-full min-h-0 aspect-square shrink-0 rounded-l-none rounded-r-2xl p-0"
                accessibilityLabel={`Delete ${project.name}`}
                disabled={isDeleting}
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
            onPress={(event) => {
              if (deletionInFlight.current || isDeleting)
                event.preventDefault();
            }}
            asChild
          >
            <Pressable
              disabled={isDeleting}
              accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
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
              className={cn(
                "gap-4 rounded-2xl border border-border bg-card p-4 active:opacity-80",
                actionsVisible && "rounded-r-none",
              )}
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
                  <PText className="text-lg">{updatedLabel}</PText>
                  {sourceLabel && (
                    <View className="items-center flex-row gap-2">
                      <Icon
                        family="Feather"
                        name="corner-down-right"
                        className="text-muted-foreground"
                        size={16}
                      />
                      <PText className="text-lg">{sourceLabel}</PText>
                    </View>
                  )}
                </View>
                <View
                  className={cn("rounded-full px-3 py-1", status.className)}
                >
                  <PText className={status.textClassName}>{status.label}</PText>
                </View>
              </View>
            </Pressable>
          </Link>
        </Swipeable>
      </View>
      {isDeleting && (
        <View
          className="absolute inset-0 items-center justify-center gap-3 rounded-2xl bg-background/70"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Deleting ${project.name}`}
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator
            size="large"
            className="text-primary"
            accessible={false}
          />
        </View>
      )}
    </View>
  );
};
