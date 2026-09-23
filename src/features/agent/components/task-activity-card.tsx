import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { MarkdownText } from "@/components/markdown-text";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { formatTaskActivityButton, formatTaskStatus } from "../lib/formatters";
import type { AgentTaskRecord } from "../types";
import { TaskActivityStats } from "./task-activity-stats";

const cardTransition = LinearTransition.duration(220).reduceMotion(
  ReduceMotion.System,
);
const detailsEntrance = FadeInDown.duration(200).reduceMotion(
  ReduceMotion.System,
);
const detailsExit = FadeOut.duration(140).reduceMotion(ReduceMotion.System);

type TaskActivityCardProps = {
  task: AgentTaskRecord;
  onViewActivity: () => void;
};

export const TaskActivityCard = ({
  task,
  onViewActivity,
}: TaskActivityCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const status = formatTaskStatus(task.event.status);
  const activityButton = formatTaskActivityButton(task.event.status);
  return (
    <Animated.View
      testID="task-activity-card"
      layout={cardTransition}
      className="mb-3 overflow-hidden rounded-2xl border border-border bg-card/60"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${task.request.title}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        className="min-h-16 flex-row items-center gap-3 p-4 active:opacity-60"
      >
        <Icon
          family="Feather"
          name={status.icon}
          size={22}
          className={status.className}
        />
        <View className="min-w-0 flex-1 gap-1">
          <PText className="font-medium text-foreground">
            {task.request.title}
          </PText>
          <PText className={status.className}>{status.label}</PText>
        </View>
        <Icon
          family="Feather"
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          className="text-muted-foreground"
        />
      </Pressable>
      {task.connectionError ? (
        <PText className="px-4 pb-3 text-warning">{task.connectionError}</PText>
      ) : null}
      {expanded ? (
        <Animated.View
          testID="task-card-details"
          entering={detailsEntrance}
          exiting={detailsExit}
          className="gap-4 border-t border-border p-4"
        >
          <View className="gap-2">
            <PText className="font-medium text-foreground text-lg">
              Your request
            </PText>
            <MarkdownText text={task.request.instruction} />
          </View>
          {task.event.summary ? (
            <View className="gap-2">
              <PText className="font-medium text-foreground text-lg">
                {task.event.status === "failed" ? "Needs attention" : "Summary"}
              </PText>
              <MarkdownText
                text={task.event.summary}
                streaming={
                  task.event.status !== "completed" &&
                  task.event.status !== "failed"
                }
              />
            </View>
          ) : null}
          <TaskActivityStats logs={task.event.logs} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activityButton}
            onPress={onViewActivity}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 active:opacity-60"
          >
            <Icon
              family="Feather"
              name="activity"
              size={18}
              className="text-secondary-foreground"
            />
            <PText className="shrink font-medium text-secondary-foreground">
              {activityButton}
            </PText>
            <Icon
              family="Feather"
              name="arrow-right"
              size={18}
              className="text-secondary-foreground"
            />
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
};
