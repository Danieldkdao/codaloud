import { useRef, useState, type ReactNode } from "react";
import { View, type PressableProps } from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useSwipePressGuard } from "@/hooks/use-swipe-press-guard";
import { alert, confirmAction } from "@/lib/utils";
import { formatTaskReviewAction } from "../lib/formatters";
import { agentTasks } from "../task-runtime";
import type { AgentTaskRecord } from "../types";

const rowEntrance = FadeInDown.duration(220).reduceMotion(ReduceMotion.System);
const rowExit = FadeOut.duration(140).reduceMotion(ReduceMotion.System);

type TaskHistoryRowProps = {
  task: AgentTaskRecord;
  children: (controls: {
    actionsVisible: boolean;
    shouldSuppressPress: () => boolean;
    accessibilityProps: Pick<
      PressableProps,
      "accessibilityHint" | "accessibilityActions" | "onAccessibilityAction"
    >;
  }) => ReactNode;
};

export const TaskHistoryRow = ({ task, children }: TaskHistoryRowProps) => {
  const swipeable = useRef<SwipeableMethods>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const pressGuard = useSwipePressGuard({ allowPressDuringSettling: true });
  const review = formatTaskReviewAction(task.reviewed);
  const canDelete =
    task.event.status === "completed" || task.event.status === "failed";
  const perform = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    swipeable.current?.close();
    try {
      await action();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to update task history. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const toggleReviewed = () =>
    perform(() =>
      agentTasks.setReviewed(task.request.requestId, !task.reviewed),
    );
  const deleteHistory = () => {
    if (!canDelete || pending.current) return;
    swipeable.current?.close();
    confirmAction(
      "Delete task history?",
      `Remove “${task.request.title}” from this device’s history? Your project files will not be deleted.`,
      {
        actionText: "Delete",
        onConfirmPress: () => {
          void perform(() => agentTasks.removeHistory(task.request.requestId));
        },
      },
    );
  };

  return (
    <Animated.View
      testID="task-history-row"
      entering={rowEntrance}
      exiting={rowExit}
      className="mb-3 overflow-hidden rounded-2xl"
      {...pressGuard.touchHandlers}
    >
      <Swipeable
        ref={swipeable}
        enabled={!busy}
        friction={2}
        rightThreshold={48}
        overshootLeft={false}
        overshootRight={false}
        onSwipeableOpenStartDrag={() => {
          pressGuard.onDrag();
          setActionsVisible(true);
        }}
        onSwipeableCloseStartDrag={pressGuard.onDrag}
        onSwipeableWillOpen={() => {
          pressGuard.onSettleStart();
          setActionsVisible(true);
        }}
        onSwipeableWillClose={() => {
          pressGuard.onSettleStart();
        }}
        onSwipeableOpen={pressGuard.onSettleEnd}
        onSwipeableClose={() => {
          pressGuard.onSettleEnd();
          // Keep the shared edge square until the actions are fully hidden.
          setActionsVisible(false);
        }}
        renderRightActions={() => (
          <View
            className="h-full flex-row items-stretch"
            accessibilityElementsHidden={!actionsVisible || busy}
            importantForAccessibility={
              actionsVisible && !busy ? "auto" : "no-hide-descendants"
            }
          >
            <Button
              variant="secondary"
              className="h-full min-h-0 aspect-square shrink-0 rounded-none p-0"
              accessibilityLabel={`${review.label}: ${task.request.title}`}
              accessibilityState={{ checked: task.reviewed, busy }}
              disabled={busy}
              onPress={() => {
                if (!pressGuard.shouldSuppressPress()) void toggleReviewed();
              }}
            >
              <Icon
                family="Feather"
                name={review.icon}
                size={22}
                className="text-secondary-foreground"
                accessible={false}
              />
            </Button>
            <Button
              variant="destructive"
              className="h-full min-h-0 aspect-square shrink-0 rounded-l-none rounded-r-2xl p-0"
              accessibilityLabel={`Delete history: ${task.request.title}`}
              accessibilityHint={
                canDelete
                  ? "Asks for confirmation. Does not delete project files."
                  : "Available when this task finishes."
              }
              disabled={busy || !canDelete}
              onPress={() => {
                if (!pressGuard.shouldSuppressPress()) deleteHistory();
              }}
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
        {children({
          actionsVisible,
          shouldSuppressPress: pressGuard.shouldSuppressPress,
          accessibilityProps: {
            accessibilityHint: "Swipe left for review and history actions.",
            accessibilityActions: [
              { name: "review", label: review.label },
              ...(canDelete
                ? [{ name: "delete", label: "Delete task history" }]
                : []),
            ],
            onAccessibilityAction: ({ nativeEvent }) => {
              if (nativeEvent.actionName === "review") void toggleReviewed();
              if (nativeEvent.actionName === "delete") deleteHistory();
            },
          },
        })}
      </Swipeable>
    </Animated.View>
  );
};
