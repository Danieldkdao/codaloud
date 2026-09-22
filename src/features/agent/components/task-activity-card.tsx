import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { MarkdownText } from "@/components/markdown-text";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { formatTaskActivity, formatTaskStatus } from "../lib/formatters";
import type { AgentTaskRecord } from "../types";

export const TaskActivityCard = ({ task }: { task: AgentTaskRecord }) => {
  const [expanded, setExpanded] = useState(false);
  const { height } = useWindowDimensions();
  const status = formatTaskStatus(task.event.status);
  const activity = formatTaskActivity(task.event.logs);
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-border bg-card">
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
        <View className="gap-4 border-t border-border p-4">
          {task.event.summary ? (
            <View className="gap-2">
              <PText className="font-medium text-foreground">
                {task.event.status === "failed" ? "Needs attention" : "Summary"}
              </PText>
              <MarkdownText
                text={task.event.summary}
                streaming={!["completed", "failed"].includes(task.event.status)}
              />
            </View>
          ) : null}
          <View className="gap-2">
            <PText className="font-medium text-foreground">Your request</PText>
            <MarkdownText text={task.request.instruction} />
          </View>
          {activity.length ? (
            <View className="gap-2">
              <PText className="font-medium text-foreground">Activity</PText>
              <ScrollView
                testID="task-activity-list"
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={{ maxHeight: Math.min(220, height * 0.3) }}
              >
                {activity.map((entry) => (
                  <View
                    key={entry.id}
                    className="flex-row items-start gap-3 py-2"
                  >
                    <Icon
                      family="Feather"
                      name={entry.icon}
                      size={20}
                      className="text-muted-foreground"
                    />
                    <View className="min-w-0 flex-1">
                      <PText className="text-foreground">{entry.label}</PText>
                      {entry.state !== "info" ? (
                        <PText
                          className={cn(
                            "text-muted-foreground",
                            entry.state === "running" && "text-primary",
                          )}
                        >
                          {entry.state === "completed"
                            ? "Completed"
                            : task.event.status === "failed"
                              ? "Not completed"
                              : "Running"}
                        </PText>
                      ) : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};
