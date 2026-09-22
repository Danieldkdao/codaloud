import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeInUp,
  FadeIn,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { enterGlassSurface, exitGlassSurface } from "@/lib/glass-animations";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { useAgentTasks } from "../hooks/use-agent-tasks";
import { formatTaskCounts, formatTaskStatus } from "../lib/formatters";

export const TaskStatusBar = ({ projectId }: { projectId: string }) => {
  const tasks = useAgentTasks().filter(
    (task) => task.request.projectId === projectId,
  );
  const [open, setOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const primary = useThemeColor("primary");
  if (!tasks.length) return null;
  const working = tasks.some(
    (task) => !["completed", "failed"].includes(task.event.status),
  );
  return (
    <>
      <Animated.View
        entering={enterGlassSurface}
        exiting={exitGlassSurface}
        layout={LinearTransition.duration(180).reduceMotion(
          ReduceMotion.System,
        )}
        style={{
          alignSelf: "center",
          width: Math.min(width - 32, 420),
          marginBottom: 8,
        }}
      >
        <GlassSurface borderRadius={24}>
          <Animated.View
            entering={FadeIn.duration(240).reduceMotion(ReduceMotion.System)}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View agent tasks"
              onPress={() => setOpen(true)}
              className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:opacity-60"
            >
              {working ? (
                <ActivityIndicator color={primary} />
              ) : (
                <Icon
                  family="Feather"
                  name={
                    tasks.some((task) => task.event.status === "failed")
                      ? "alert-circle"
                      : "check-circle"
                  }
                  size={20}
                  className={cn(
                    "text-success-foreground",
                    tasks.some((task) => task.event.status === "failed") &&
                      "text-destructive",
                  )}
                />
              )}
              <PText className="flex-1 text-foreground font-medium">
                {formatTaskCounts(tasks)}
              </PText>
              <Icon
                family="Feather"
                name="chevron-up"
                size={18}
                className="text-muted-foreground"
              />
            </Pressable>
          </Animated.View>
        </GlassSurface>
      </Animated.View>
      <ContentSheet open={open} onOpenChange={setOpen}>
        <View className="px-5 pb-8 gap-4">
          <View className="flex-row items-center">
            <HeadingText className="text-2xl flex-1">
              Agent activity
            </HeadingText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close task details"
              onPress={() => setOpen(false)}
              className="size-11 items-center justify-center"
            >
              <Icon
                family="Feather"
                name="x"
                size={22}
                className="text-foreground"
              />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: height * 0.6 }}>
            {tasks.map((task) => {
              const status = formatTaskStatus(task.event.status);
              return (
                <Animated.View
                  key={task.request.requestId}
                  entering={FadeInUp.duration(180)}
                  className="gap-3 border-b border-border py-4"
                >
                  <View className="flex-row items-center gap-3">
                    {["running", "waiting"].includes(task.event.status) ? (
                      <ActivityIndicator color={primary} />
                    ) : (
                      <Icon
                        family="Feather"
                        name={status.icon}
                        size={22}
                        className={status.className}
                      />
                    )}
                    <PText
                      className={cn("font-medium flex-1", status.className)}
                    >
                      {status.label}
                    </PText>
                  </View>
                  <PText className="text-foreground" numberOfLines={3}>
                    {task.request.instruction}
                  </PText>
                  {task.event.logs.map((entry, index) => (
                    <PText key={`${index}:${entry}`}>{entry}</PText>
                  ))}
                  {task.event.summary ? (
                    <PText
                      selectable
                      className={cn(
                        "text-foreground",
                        task.event.status === "failed" && "text-destructive",
                      )}
                    >
                      {task.event.summary}
                    </PText>
                  ) : null}
                  {task.connectionError ? (
                    <PText className="text-warning">
                      {task.connectionError}
                    </PText>
                  ) : null}
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      </ContentSheet>
    </>
  );
};
