import { useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";
import { MarkdownText } from "@/components/markdown-text";
import { KeyboardAwareView } from "@/components/ui/keyboard-aware-view";
import { ProjectAgentSearch } from "@/features/projects/components/project-agent-search";
import {
  ContentSheet,
  type ContentSheetProps,
} from "@/components/ui/content-sheet";
import { Icon } from "@/components/ui/icon";
import { ScrollFadeScrollView } from "@/components/ui/scroll-fade-scroll-view";
import { HeadingText, PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { formatTaskActivity, formatTaskActivityState } from "../lib/formatters";
import type { AgentTaskRecord } from "../types";

type TaskActivitySheetProps = Pick<
  ContentSheetProps,
  "open" | "onOpenChange" | "onDismiss"
> & { task: AgentTaskRecord };
const entryEntrance = FadeInDown.duration(240).reduceMotion(
  ReduceMotion.System,
);
const entryTransition = LinearTransition.duration(200).reduceMotion(
  ReduceMotion.System,
);

export const TaskActivitySheet = ({
  task,
  open,
  onOpenChange,
  onDismiss,
}: TaskActivitySheetProps) => {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const following = useRef(true);
  const userScrolling = useRef(false);
  const userGesture = useRef(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const activity = formatTaskActivity(task.event.logs);
  const filteredActivity = activity.filter(
    (entry) =>
      !query ||
      entry.label.toLowerCase().includes(query) ||
      formatTaskActivityState(entry.state, task.event.status)
        ?.toLowerCase()
        .includes(query),
  );
  // Historical rows should not replay their entrance whenever the sheet opens.
  const initialRows = useRef(new Set(activity.map((entry) => entry.id)));
  const working =
    task.event.status !== "completed" && task.event.status !== "failed";
  const scrollToLatest = () => {
    userGesture.current = false;
    userScrolling.current = false;
    scroll.current?.scrollToEnd({ animated: !reducedMotion });
  };

  return (
    <ContentSheet open={open} onOpenChange={onOpenChange} onDismiss={onDismiss}>
      <KeyboardAwareView
        testID="task-activity-detail"
        style={{ height: height * 0.82 }}
      >
        <View className="flex-1 gap-4">
          <View className="mx-5 flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to agent activity"
              onPress={() => {
                Keyboard.dismiss();
                onOpenChange(false);
              }}
              className="size-11 items-center justify-center rounded-full bg-secondary active:opacity-60"
            >
              <Icon
                family="Feather"
                name="arrow-left"
                size={22}
                className="text-secondary-foreground"
              />
            </Pressable>
            <HeadingText className="min-w-0 flex-1 text-2xl text-foreground">
              {task.request.title}
            </HeadingText>
          </View>
          <ScrollFadeScrollView
            ref={scroll}
            testID="task-activity-list"
            containerStyle={{ flex: 1 }}
            style={{ flex: 1 }}
            contentContainerStyle={{
              gap: 20,
              paddingVertical: 8,
              paddingLeft: 20 + insets.left,
              paddingRight: 20 + insets.right,
              // Reserve the floating search capsule and its safe-area margin.
              paddingBottom: 80 + Math.max(insets.bottom, 12),
            }}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (open && !query && following.current) scrollToLatest();
            }}
            onLayout={() => {
              if (open && !query && following.current) scrollToLatest();
            }}
            onScrollBeginDrag={() => {
              userGesture.current = true;
              userScrolling.current = true;
            }}
            onScrollEndDrag={() => {
              userScrolling.current = false;
            }}
            onMomentumScrollBegin={() => {
              userScrolling.current = userGesture.current;
            }}
            onMomentumScrollEnd={() => {
              userGesture.current = false;
              userScrolling.current = false;
            }}
            onScroll={({
              nativeEvent: { contentOffset, contentSize, layoutMeasurement },
            }) => {
              const atBottom =
                contentSize.height -
                  layoutMeasurement.height -
                  contentOffset.y <=
                48;
              // Automatic scrolling emits intermediate offsets; only user gestures pause follow mode.
              if (userScrolling.current || atBottom) {
                following.current = atBottom;
              }
            }}
          >
            <View className="gap-1">
              {!filteredActivity.length ? (
                <PText className="text-muted-foreground">
                  {query
                    ? "No matching activity."
                    : working
                      ? "Waiting for the first update…"
                      : "No activity was recorded."}
                </PText>
              ) : null}
              {filteredActivity.map((entry) => {
                const state = formatTaskActivityState(
                  entry.state,
                  task.event.status,
                );
                return (
                  <Animated.View
                    key={entry.id}
                    testID={`task-activity-entry-${entry.id}`}
                    entering={
                      query || initialRows.current.has(entry.id)
                        ? undefined
                        : entryEntrance
                    }
                    layout={entryTransition}
                    className="flex-row items-start gap-3 py-3"
                  >
                    <View className="size-10 items-center justify-center rounded-xl bg-secondary">
                      <Icon
                        family="Feather"
                        name={entry.icon}
                        size={20}
                        className={cn(
                          "text-muted-foreground",
                          entry.state === "completed" &&
                            "text-success-foreground",
                          entry.state === "running" &&
                            working &&
                            "text-primary",
                        )}
                      />
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <MarkdownText text={entry.label} />
                      {state ? (
                        <PText
                          className={cn(
                            "text-muted-foreground",
                            entry.state === "running" &&
                              working &&
                              "text-primary",
                          )}
                        >
                          {state}
                        </PText>
                      ) : null}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </ScrollFadeScrollView>
          <ProjectAgentSearch
            floating
            query={search}
            onQueryChange={(value) => {
              setSearch(value);
              following.current = false;
              userGesture.current = false;
              userScrolling.current = false;
              // Keep matches at the top instead of following incoming logs during a search.
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
          />
        </View>
      </KeyboardAwareView>
    </ContentSheet>
  );
};
