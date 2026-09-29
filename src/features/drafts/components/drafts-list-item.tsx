import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Link, useRouter } from "expo-router";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import { useDeleteDraft } from "@/features/drafts/hooks/use-delete-draft";
import { resolveDraftLanguage } from "@/features/drafts/lib/draft-filename";
import { draftHasAsset } from "@/features/drafts/lib/draft-assets";
import { isProjectImagePath } from "@/features/projects/lib/image-files";
import {
  formatDraftFileType,
  formatDraftPreview,
  formatDraftTitle,
  formatDraftUpdatedAt,
} from "@/features/drafts/lib/formatters";
import type { DraftResponseData } from "@/features/drafts/types";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";
import { alert, cn, confirmAction } from "@/lib/utils";

type DraftsListItemProps = {
  draft: DraftResponseData;
};

export const DraftsListItem = ({ draft }: DraftsListItemProps) => {
  const router = useRouter();
  const swipeable = useRef<SwipeableMethods>(null);
  const title = formatDraftTitle(draft);
  const language = resolveDraftLanguage(draft.filename);
  const hasAsset = draft.content === "" && draftHasAsset(draft.id);
  const preview = hasAsset
    ? isProjectImagePath(draft.filename ?? "")
      ? "Image on this device"
      : "File on this device"
    : formatDraftPreview(draft.content);
  const updatedLabel = formatDraftUpdatedAt(draft.updatedAt);
  const deletion = useDeleteDraft();
  const showSuccess = useSuccessFeedback();
  const isDeleting = deletion.isPending;
  const [actionsVisible, setActionsVisible] = useState(false);
  const deleteDraft = () => {
    if (isDeleting) return;
    confirmAction(
      "Delete draft?",
      `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      {
        actionText: "Delete",
        onConfirmPress: async () => {
          try {
            await deletion.mutateAsync(draft.id);
            showSuccess("Draft deleted");
          } catch (error) {
            alert(
              error instanceof Error
                ? error.message
                : "Unable to delete this draft. Please try again.",
            );
          }
        },
      },
    );
  };
  const copyToProject = () => {
    if (isDeleting) return;
    router.push({
      pathname: "/draft/copy-to-project",
      params: { draftId: draft.id },
    });
  };

  return (
    <View className="relative">
      <View
        pointerEvents={isDeleting ? "none" : "auto"}
        accessibilityElementsHidden={isDeleting}
        importantForAccessibility={isDeleting ? "auto" : "no-hide-descendants"}
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
                accessibilityLabel={`Copy ${title} into a project`}
                disabled={isDeleting}
                onPress={copyToProject}
              >
                <Icon
                  family="Feather"
                  name="copy"
                  size={22}
                  className="text-foreground"
                  accessible={false}
                />
              </Button>
              <Button
                variant="destructive"
                className="h-full min-h-0 aspect-square shrink-0 rounded-l-none rounded-r-2xl p-0"
                accessibilityLabel={`Delete ${title}`}
                disabled={isDeleting}
                onPress={deleteDraft}
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
              pathname: "/draft/[draftId]",
              params: { draftId: draft.id },
            }}
            onPress={(event) => {
              if (isDeleting) event.preventDefault();
            }}
            asChild
          >
            <Pressable
              disabled={isDeleting}
              accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
              accessibilityRole="link"
              accessibilityLabel={[
                title,
                formatDraftFileType(language.fileType),
                updatedLabel,
              ].join(", ")}
              accessibilityHint="Open draft. Swipe left for Copy to project and Delete."
              accessibilityActions={[
                { name: "copy", label: "Copy to a project" },
                { name: "delete", label: "Delete draft" },
              ]}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === "copy") copyToProject();
                if (nativeEvent.actionName === "delete") deleteDraft();
              }}
              className={cn(
                "gap-4 rounded-2xl border border-border bg-card p-4 active:opacity-80",
                actionsVisible && "rounded-r-none",
              )}
            >
              <View className="flex-row items-start gap-3">
                <View className="size-12 items-center justify-center rounded-xl bg-secondary">
                  <Icon
                    family="Feather"
                    name={language.highlighted ? "code" : "file-text"}
                    size={24}
                    className="text-secondary-foreground"
                    accessible={false}
                  />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <HeadingText
                    className={cn(
                      "text-xl text-card-foreground",
                      draft.filename && "font-medium",
                      !draft.filename &&
                        "italic font-normal text-muted-foreground",
                    )}
                    numberOfLines={1}
                  >
                    {title}
                  </HeadingText>
                  <CodeText
                    className="text-lg text-muted-foreground"
                    numberOfLines={1}
                  >
                    {preview || "No content yet"}
                  </CodeText>
                  <PText className="text-lg">{updatedLabel}</PText>
                </View>
                <View className="rounded-full bg-secondary px-3 py-1">
                  <PText className="text-base text-secondary-foreground">
                    {formatDraftFileType(language.fileType)}
                  </PText>
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
          accessibilityLabel={`Deleting ${title}`}
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
