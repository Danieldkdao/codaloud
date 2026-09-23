import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeIn,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { enterGlassSurface, exitGlassSurface } from "@/lib/glass-animations";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { useAgentTasks } from "../hooks/use-agent-tasks";
import { formatTaskCounts } from "../lib/formatters";

export const TaskStatusBar = ({ projectId }: { projectId: string }) => {
  const tasks = useAgentTasks().filter(
    (task) => task.request.projectId === projectId,
  );
  const router = useRouter();
  const { width } = useWindowDimensions();
  const primary = useThemeColor("primary");
  if (!tasks.length) return null;
  const working = tasks.some(
    (task) => !["completed", "failed"].includes(task.event.status),
  );
  const failed = tasks.some((task) => task.event.status === "failed");

  return (
    <Animated.View
      entering={enterGlassSurface}
      exiting={exitGlassSurface}
      layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)}
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
            onPress={() =>
              router.navigate({
                pathname: "/projects/[projectId]/agent",
                params: { projectId },
              })
            }
            className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:opacity-60"
          >
            {working ? (
              <ActivityIndicator color={primary} />
            ) : (
              <Icon
                family="Feather"
                name={failed ? "alert-circle" : "check-circle"}
                size={20}
                className={cn(
                  "text-success-foreground",
                  failed && "text-destructive",
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
  );
};
