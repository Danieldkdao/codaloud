import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  PanResponder,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { PText } from "@/components/ui/text";
import { formatEditorThemeClass } from "@/features/editor/lib/formatters";
import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { cn } from "@/lib/utils";
import { projectTerminalSession } from "../actions/terminal-session";
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
  const session = useMemo(() => projectTerminalSession(projectId), [projectId]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { preferences } = useEditorPreferences();
  const [runPhase, setRunPhase] = useState<"idle" | "syncing" | "running">(
    "idle",
  );
  const runToken = useRef(0);
  const [runError, setRunError] = useState<string | null>(null);
  const seenSync = useRef(state.syncGeneration);
  const maxHeight = Math.max(240, screenHeight * 0.72);
  const animatedHeight = useSharedValue(height);
  const dragStart = useRef(height);
  const panelStyle = useAnimatedStyle(() => ({ height: animatedHeight.value }));
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
          "flex-1 bg-background",
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
          <View className="flex-row items-center gap-2">
            <Icon
              family="Feather"
              name="terminal"
              size={19}
              className="text-foreground"
            />
            <PText className="text-lg font-semibold text-foreground">
              Terminal
            </PText>
            <PText className="text-lg text-muted-foreground">
              {state.status}
            </PText>
          </View>
          <View className="flex-row">
            {runPhase === "idle"
              ? action(
                  "Run current file",
                  "play",
                  () => {
                    void run();
                  },
                  !activeFilePath,
                )
              : action("Stop current file", "square", stopRun)}
            {action("Sync workspace", "refresh-cw", () => {
              void session.sync().catch(() => {});
            })}
            {action("Clear terminal output", "trash-2", () => session.clear())}
            {action("Close terminal", "x", onClose)}
          </View>
        </View>
        <PText className="px-4 pb-1 text-base text-muted-foreground">
          Files may take a moment to sync. Tap Sync to refresh.
        </PText>
        {state.error ? (
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
        {state.syncMessage ? (
          <PText className="px-4 pb-1 text-base text-muted-foreground">
            {state.syncMessage}
          </PText>
        ) : null}
        <View className="flex-1 px-2 pb-2">
          <TerminalSurface
            key={`${state.clearGeneration}:${preferences.theme}:${preferences.fontSize}`}
            session={session}
            fontSize={preferences.fontSize - 4}
          />
        </View>
      </View>
    </Animated.View>
  );
};
