import { useDebouncer } from "@tanstack/react-pacer";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
  type TextInput,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { useThemeColor } from "@/hooks/use-theme";
import {
  ProjectSearchOverlay,
  useProjectSearchOverlay,
} from "./project-search-overlay";

const buttonSize = 56;

type ProjectWorkspaceSearchProps = {
  anchorRef?: RefObject<View | null>;
  anchorPlacement?: "above" | "replace";
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  value?: string;
  // Receives the final input after a one-second typing pause.
  onChangeText?: (value: string) => void;
  // Immediate draft updates let the screen hide results for obsolete input.
  onDraftChange?: (value: string) => void;
  accessory?: ReactNode;
  children?: ReactNode;
};

export const ProjectWorkspaceSearch = ({
  anchorRef,
  anchorPlacement = "above",
  onOpenChange,
  placeholder = "Search Files",
  accessibilityLabel = "Search files",
  value,
  onChangeText,
  onDraftChange,
  accessory,
  children,
}: ProjectWorkspaceSearchProps) => {
  const overlay = useProjectSearchOverlay();
  const insets = useSafeAreaInsets();
  const shadow = useThemeColor("navigation-shadow");
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const buttonRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState(value ?? "");
  const { maybeExecute: handleDebouncedSearch, cancel } = useDebouncer(
    (text: string) => onChangeText?.(text),
    { wait: 1000 },
  );

  useEffect(() => {
    // Parent resets replace the draft and discard any search still waiting to run.
    cancel();
    setQuery(value ?? "");
  }, [value, cancel]);
  const keyboardOffset = useSharedValue(0);
  const [anchor, setAnchor] = useState<{
    right: number;
    top: number;
    windowTop: number;
  } | null>(null);
  const progress = useSharedValue(0);
  const availableWidth = width - insets.left - insets.right - 32;
  const barWidth = Math.min(availableWidth, 440);
  const rightInset =
    16 + insets.right + Math.max(0, (availableWidth - 440) / 2);
  const closing = useRef(false);
  const openingStarted = useRef(false);
  const isOpen = anchor !== null;

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  useEffect(
    () => () => {
      onOpenChange?.(false);
    },
    [onOpenChange],
  );

  // A resized window needs a fresh native anchor measurement before reopening.
  useEffect(() => {
    setAnchor(null);
    progress.value = 0;
    return () => cancelAnimation(progress);
  }, [width, progress]);

  useEffect(() => {
    if (!anchor) return;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
      (event) => {
        keyboardOffset.value = withTiming(
          Math.max(
            0,
            anchor.windowTop + buttonSize + 12 - event.endCoordinates.screenY,
          ),
          { duration: reducedMotion ? 0 : event.duration || 250 },
        );
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        keyboardOffset.value = withTiming(0, {
          duration: reducedMotion ? 0 : 250,
        });
      },
    );
    return () => {
      show.remove();
      hide.remove();
      cancelAnimation(keyboardOffset);
    };
  }, [anchor, keyboardOffset, reducedMotion]);

  const focusInput = () => {
    if (!closing.current) inputRef.current?.focus();
  };

  const open = () => {
    const target = anchorRef?.current ?? buttonRef.current;
    target?.measureInWindow((_x, y) => {
      overlay.measureRoot((_rootX, rootY) => {
        closing.current = false;
        openingStarted.current = false;
        progress.value = 0;
        keyboardOffset.value = 0;
        const windowTop = Math.max(
          insets.top + 8,
          anchorPlacement === "replace" ? y : y - buttonSize - 4,
        );
        setAnchor({ right: rightInset, top: windowTop - rootY, windowTop });
      });
    });
  };

  const finishClosing = useCallback(() => setAnchor(null), []);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Keyboard.dismiss();
    progress.value = withTiming(
      0,
      { duration: reducedMotion ? 0 : 260, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) scheduleOnRN(finishClosing);
      },
    );
  }, [progress, reducedMotion, finishClosing]);

  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        close();
        return true;
      },
    );
    return () => subscription.remove();
  }, [isOpen, close]);

  const startOpening = () => {
    if (closing.current || openingStarted.current) return;
    openingStarted.current = true;
    progress.value = withTiming(
      1,
      { duration: reducedMotion ? 0 : 340, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) scheduleOnRN(focusInput);
      },
    );
  };

  const morphStyle = useAnimatedStyle(() => ({
    width: buttonSize + (barWidth - buttonSize) * progress.value,
    opacity: progress.value,
    transform: [
      {
        translateY:
          12 * (1 - progress.value) - keyboardOffset.value * progress.value,
      },
    ],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: 8 * (1 - progress.value) }],
  }));

  return (
    <>
      <View ref={buttonRef} collapsable={false}>
        <Pressable
          onPress={isOpen ? close : open}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Opens the search input"
          className="items-center justify-center rounded-full active:bg-secondary"
          style={{ width: 48, height: 48 }}
        >
          <Icon
            family="Feather"
            name="search"
            size={22}
            accessible={false}
            className="text-foreground"
          />
        </Pressable>
      </View>

      {anchor ? (
        <ProjectSearchOverlay onOutsidePress={close} onShow={startOpening}>
          <View
            style={{ flex: 1 }}
            pointerEvents="box-none"
            onAccessibilityEscape={close}
          >
            <Animated.View
              style={[
                { position: "absolute", top: anchor.top, right: anchor.right },
                morphStyle,
              ]}
            >
              {/* Native glass can stop rendering under a parent animated from opacity zero.
                  A solid card keeps search readable throughout every opening. */}
              <View
                className="bg-card border border-border"
                style={{
                  borderRadius: 28,
                  boxShadow: [
                    { offsetX: 0, offsetY: 2, blurRadius: 12, color: shadow },
                  ],
                }}
              >
                <View
                  style={{
                    height: buttonSize,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingRight: accessory ? 6 : 20,
                    overflow: "hidden",
                    borderRadius: 28,
                  }}
                >
                  <View
                    style={{
                      width: buttonSize,
                      height: buttonSize,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      family="Feather"
                      name="search"
                      size={22}
                      accessible={false}
                      className="text-foreground"
                    />
                  </View>
                  <Animated.View style={[{ flex: 1, minWidth: 0 }, labelStyle]}>
                    <Input
                      ref={inputRef}
                      type="search"
                      variant="ghost"
                      placeholder={placeholder}
                      accessibilityLabel={placeholder}
                      value={query}
                      onChangeText={(text) => {
                        setQuery(text);
                        onDraftChange?.(text);
                        if (onChangeText) handleDebouncedSearch(text);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      submitBehavior="submit"
                      className="border-0 px-0 focus:border-transparent focus:outline-0"
                    />
                  </Animated.View>
                  {accessory ? (
                    <Animated.View style={labelStyle}>
                      {accessory}
                    </Animated.View>
                  ) : null}
                </View>
              </View>
            </Animated.View>
            {/* Native accessory sheets remain interactive inside the search layer. */}
            {children}
          </View>
        </ProjectSearchOverlay>
      ) : null}
    </>
  );
};
