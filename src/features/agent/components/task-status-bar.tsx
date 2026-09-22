import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
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
import { formatTaskCounts } from "../lib/formatters";
import { TaskActivityCard } from "./task-activity-card";

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
            {tasks.map((task) => (
              <TaskActivityCard key={task.request.requestId} task={task} />
            ))}
          </ScrollView>
        </View>
      </ContentSheet>
    </>
  );
};
