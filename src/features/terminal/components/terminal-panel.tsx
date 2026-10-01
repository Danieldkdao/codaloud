import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Keyboard,
  PanResponder,
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { NativeSelect } from "@/components/ui/native-select";
import { formatWorkspaceTab } from "@/features/projects/lib/formatters";
import { Icon } from "@/components/ui/icon";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { PText } from "@/components/ui/text";
import { useRouter, type Href } from "expo-router";
import { formatEditorThemeClass } from "@/features/editor/lib/formatters";
import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { useThemeColor } from "@/hooks/use-theme";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { cn } from "@/lib/utils";
import { projectTerminalSession } from "../actions/terminal-session";
import { formatTerminalAccess, formatTerminalStatus } from "../lib/formatters";
import { runCommandForFile } from "../lib/run-command";
import { TerminalSurface } from "./terminal-surface";

export const TerminalPanel = ({
  projectId,
  activeFilePath,
  dockHeight,
  height,
  onHeightChange,
  onClose,
  onSyncFiles,
}: {
  projectId: string;
  activeFilePath: string | null;
  dockHeight: number;
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
  onSyncFiles: (changes: { downloaded: string[]; deleted: string[] }) => void;
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const keyboard = useKeyboardFrame();
  const router = useRouter();
  const session = useMemo(() => projectTerminalSession(projectId), [projectId]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { preferences } = useEditorPreferences();
  const primary = useThemeColor("primary") as string;
  const [runPhase, setRunPhase] = useState<"idle" | "syncing" | "running">(
    "idle",
  );
  const runToken = useRef(0);
  const [runError, setRunError] = useState<string | null>(null);
  const unavailable = state.status === "blocked" || state.status === "error";
  const accessPresentation = formatTerminalAccess(state.access, state.error);
  const seenSync = useRef(state.syncGeneration);
  const maxHeight = Math.max(240, screenHeight * 0.72);
  const animatedHeight = useSharedValue(height);
  const dragStart = useRef(height);
  const panelStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));
  useEffect(() => {
    animatedHeight.value = withSpring(Math.min(height, maxHeight), {
      damping: 24,
      stiffness: 230,
    });
  }, [height, maxHeight, animatedHeight]);
  const clampHeight = (next: number) =>
    Math.max(180, Math.min(maxHeight, next));
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
        onPanResponderGrant: () => {
          dragStart.current = animatedHeight.value;
        },
        onPanResponderMove: (_, gesture) => {
          animatedHeight.value = clampHeight(dragStart.current - gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          const next = clampHeight(dragStart.current - gesture.dy);
          animatedHeight.value = withSpring(next, {
            damping: 24,
            stiffness: 230,
          });
          onHeightChange(next);
        },
        onPanResponderTerminate: () => {
          animatedHeight.value = withSpring(height, {
            damping: 24,
            stiffness: 230,
          });
        },
      }),
    [maxHeight, onHeightChange, animatedHeight, height],
  );
  useEffect(() => {
    const release = session.retainPanel();
    void session.connect().catch(() => {});
    return release;
  }, [session]);
  useEffect(() => {
    if (state.syncGeneration !== seenSync.current) {
      seenSync.current = state.syncGeneration;
      onSyncFiles({
        downloaded: state.downloadedPaths,
        deleted: state.deletedPaths,
      });
    }
  }, [state.syncGeneration, onSyncFiles]);
  const run = async () => {
    if (!activeFilePath || runPhase !== "idle") return;
    const token = ++runToken.current;
    setRunPhase("syncing");
    setRunError(null);
    try {
      const command = runCommandForFile(activeFilePath);
      const synced = await session.sync();
      if (token !== runToken.current) return;
      if (synced.conflicts.includes(activeFilePath))
        throw new Error(
          `${activeFilePath} has conflicting changes. Resolve them before running.`,
        );
      if (synced.failures.includes(activeFilePath))
        throw new Error(
          `${activeFilePath} could not sync: ${synced.failureReasons?.[activeFilePath] ?? "Try again before running."}`,
        );
      // Run in the PTY itself so input(), readline, prompts and Ctrl+C share
      // the same process stream as the visible terminal.
      setRunPhase("running");
      await session.runInPty(command + "\n", synced);
    } catch (error) {
      // The status is visible in the panel; keep input and output available.
      if (token === runToken.current && error instanceof Error)
        setRunError(error.message);
    } finally {
      if (token === runToken.current) setRunPhase("idle");
    }
  };
  const stopRun = () => {
    runToken.current++;
    setRunPhase("idle");
    void session.cancelRun().catch((error: unknown) => {
      if (error instanceof Error) setRunError(error.message);
    });
  };
  const action = (
    label: string,
    icon: "play" | "square" | "refresh-cw" | "trash-2" | "x",
    press: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={press}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
    >
      <Icon
        family="Feather"
        name={icon}
        size={19}
        className="text-foreground"
        accessible={false}
      />
    </Pressable>
  );
  return (
    <Animated.View
      accessibilityLabel="Project terminal"
      className="absolute left-0 right-0 overflow-hidden rounded-t-3xl border border-border bg-background"
      style={[
        {
          zIndex: 20,
          bottom: keyboard?.height ?? dockHeight,
        },
        panelStyle,
      ]}
    >
      <View
        className={cn(
          "flex-1 bg-card/70",
          formatEditorThemeClass(preferences.theme),
        )}
      >
        <View
          {...pan.panHandlers}
          className="h-6 items-center justify-center"
          accessibilityLabel="Drag to resize terminal"
        >
          <View className="h-1 w-12 rounded-full bg-muted-foreground" />
        </View>
        <View className="flex-row items-center justify-between px-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-1">
            <NativeSelect
              label="Project navigation"
              sections={[
                {
                  label: "Project",
                  value: "terminal",
                  kind: "actions",
                  options: (["files", "git", "agent"] as const).map(
                    (destination) => ({
                      value: destination,
                      label: formatWorkspaceTab(destination).label,
                      onSelect: () => {
                        Keyboard.dismiss();
                        router.navigate({
                          pathname: `/projects/[projectId]/${destination}`,
                          params: { projectId },
                        });
                      },
                    }),
                  ),
                },
              ]}
              trigger={
                <View className="flex-row items-center gap-1">
                  <Icon
                    family="Feather"
                    name="terminal"
                    size={19}
                    className="text-foreground"
                  />
                  <PText className="text-lg font-semibold text-foreground">
                    Terminal
                  </PText>
                  <Icon
                    family="Feather"
                    name="chevron-down"
                    size={16}
                    className="text-muted-foreground"
                  />
                </View>
              }
            />
            <PText
              numberOfLines={1}
              className="shrink text-lg text-muted-foreground"
            >
              {formatTerminalStatus(state.status, state.access)}
            </PText>
          </View>
          <View className="flex-row">
            {state.status === "closed"
              ? action("Reconnect terminal", "refresh-cw", () => {
                  void session.retry().catch(() => {});
                })
              : null}
            {runPhase === "idle"
              ? action(
                  "Run current file",
                  "play",
                  () => {
                    void run();
                  },
                  !activeFilePath || unavailable,
                )
              : action("Stop current file", "square", stopRun)}
            {action(
              "Sync workspace",
              "refresh-cw",
              () => {
                void session.sync().catch(() => {});
              },
              unavailable,
            )}
            {action("Clear terminal output", "trash-2", () => session.clear())}
            {action("Close terminal", "x", onClose)}
          </View>
        </View>
        {state.syncing && !unavailable ? (
          <View className="flex-row items-center gap-2 px-4 pb-1">
            <ActivityIndicator size="small" color={primary} />
            <PText className="flex-1 text-lg font-medium text-muted-foreground">
              {state.syncMessage ?? "Syncing project files…"}
            </PText>
          </View>
        ) : null}
        {state.error && !unavailable ? (
          <PText
            accessibilityRole="alert"
            className="px-4 text-sm text-destructive"
          >
            {state.error}
          </PText>
        ) : null}
        {runError ? (
          <PText
            accessibilityRole="alert"
            className="px-4 text-sm text-destructive"
          >
            {runError}
          </PText>
        ) : null}
        {state.syncMessage &&
        !state.syncing &&
        state.syncMessage !== "All project files are up to date." &&
        !unavailable ? (
          <PText className="px-4 pb-1 text-base text-muted-foreground">
            {state.syncMessage}
          </PText>
        ) : null}
        <View className="flex-1 px-2 pb-2">
          {unavailable ? (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            >
              <View className="items-center gap-2 px-4 py-2">
                <View className="size-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon
                    family="Feather"
                    name={accessPresentation.icon}
                    size={21}
                    className="text-primary"
                    accessible={false}
                  />
                </View>
                <PText
                  accessibilityRole="alert"
                  className="text-center text-lg font-semibold text-foreground"
                >
                  {accessPresentation.title}
                </PText>
                <PText className="text-center text-base text-muted-foreground">
                  {accessPresentation.description}
                </PText>
                <View className="flex-row items-center justify-center gap-2">
                  {accessPresentation.href ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        accessPresentation.actionLabel ?? undefined
                      }
                      onPress={() =>
                        router.push(accessPresentation.href as Href)
                      }
                      className="min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 active:opacity-80"
                    >
                      <PText className="text-base font-semibold text-primary-foreground">
                        {accessPresentation.actionLabel}
                      </PText>
                      <Icon
                        family="Feather"
                        name="arrow-up-right"
                        size={18}
                        className="text-primary-foreground"
                        accessible={false}
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Try terminal again"
                    onPress={() => void session.retry().catch(() => {})}
                    className="min-h-11 items-center justify-center rounded-xl border border-border px-4 active:opacity-60"
                  >
                    <PText className="text-base font-medium text-foreground">
                      Try again
                    </PText>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          ) : (
            <TerminalSurface
              key={`${state.clearGeneration}:${preferences.theme}:${preferences.fontSize}`}
              session={session}
              fontSize={preferences.fontSize - 4}
            />
          )}
        </View>
      </View>
    </Animated.View>
  );
};
