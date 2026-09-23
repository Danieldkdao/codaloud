import { useState } from "react";
import { Keyboard, View } from "react-native";
import Animated, {
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { TaskActivityCard } from "@/features/agent/components/task-activity-card";
import { TaskActivitySheet } from "@/features/agent/components/task-activity-sheet";
import { formatTaskStatus } from "@/features/agent/lib/formatters";
import type { AgentTaskRecord } from "@/features/agent/types";

const taskRowTransition = LinearTransition.springify()
  .duration(280)
  .dampingRatio(1)
  .reduceMotion(ReduceMotion.System);

type ProjectAgentActivityListProps = {
  tasks: AgentTaskRecord[];
  search?: string;
};

export const ProjectAgentActivityList = ({
  tasks,
  search = "",
}: ProjectAgentActivityListProps) => {
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const term = search.trim().toLowerCase();
  const filteredTasks = tasks.filter(
    (task) =>
      !term ||
      [
        task.request.title,
        task.request.instruction,
        task.event.summary ?? "",
        formatTaskStatus(task.event.status).label,
        ...task.event.logs,
      ].some((value) => value.toLowerCase().includes(term)),
  );
  // The persisted task store is append-ordered by creation. Reverse only this
  // filtered copy: presentation order must never reorder the execution queue.
  const latestTasks = filteredTasks.reverse();
  const orderedTasks = [
    ...latestTasks.filter((task) => !task.reviewed),
    ...latestTasks.filter((task) => task.reviewed),
  ];
  // Read the selected task from the live store snapshot, not a stale card copy.
  const selectedTask = tasks.find(
    (task) => task.request.requestId === selectedId,
  );

  return (
    <>
      <Animated.FlatList
        className="flex-1 bg-background"
        data={orderedTasks}
        itemLayoutAnimation={taskRowTransition}
        // Android clipping can detach a row while it crosses into its new slot.
        removeClippedSubviews={false}
        keyExtractor={(task) => task.request.requestId}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: 16,
          paddingLeft: 20 + insets.left,
          paddingRight: 20 + insets.right,
          paddingBottom: 24,
        }}
        ListEmptyComponent={
          <View className="items-center gap-3 py-16">
            <View className="size-14 items-center justify-center rounded-2xl bg-secondary">
              <Icon
                family="Feather"
                name="activity"
                size={26}
                className="text-secondary-foreground"
                accessible={false}
              />
            </View>
            <PText className="text-lg font-medium text-foreground">
              {term ? "No matching activity" : "No activity yet"}
            </PText>
            <PText className="text-center">
              {term
                ? "Try a different search."
                : "Your requests and their results will appear here."}
            </PText>
          </View>
        }
        renderItem={({ item }) => (
          <TaskActivityCard
            task={item}
            onViewActivity={() => {
              Keyboard.dismiss();
              setSelectedId(item.request.requestId);
              setLogsOpen(true);
            }}
          />
        )}
      />
      {selectedTask ? (
        <TaskActivitySheet
          key={selectedTask.request.requestId}
          task={selectedTask}
          open={logsOpen}
          onOpenChange={setLogsOpen}
          onDismiss={() => {
            setLogsOpen(false);
            setSelectedId(null);
          }}
        />
      ) : null}
    </>
  );
};
