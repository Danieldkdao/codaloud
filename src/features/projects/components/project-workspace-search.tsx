import { use, useEffect, useRef, useState } from "react";
import { Keyboard, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions, type TextInput } from "react-native";
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ProjectWorkspaceDockHeightContext } from "@/features/projects/contexts/project-workspace-context";

const buttonSize = 56;

type ProjectWorkspaceSearchProps = {
  placeholder?: string;
  accessibilityLabel?: string;
};

export const ProjectWorkspaceSearch = ({
  placeholder = "Search Files",
  accessibilityLabel = "Search files",
}: ProjectWorkspaceSearchProps) => {
  const dockHeight = use(ProjectWorkspaceDockHeightContext);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const buttonRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const keyboardOffset = useSharedValue(0);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);
  const progress = useSharedValue(0);
  const availableWidth = width - insets.left - insets.right - 32;
  const barWidth = Math.min(availableWidth, 440);
  const rightInset = 16 + insets.right + Math.max(0, (availableWidth - 440) / 2);
  const closing = useRef(false);

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
          Math.max(0, anchor.top + buttonSize + 12 - event.endCoordinates.screenY),
          { duration: reducedMotion ? 0 : event.duration || 250 },
        );
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => { keyboardOffset.value = withTiming(0, { duration: reducedMotion ? 0 : 250 }); },
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
    buttonRef.current?.measureInWindow((x, y, measuredWidth) => {
      closing.current = false;
      progress.value = 0;
      keyboardOffset.value = 0;
      setAnchor({ right: width - x - measuredWidth, top: y });
    });
  };

  const finishClosing = () => setAnchor(null);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Keyboard.dismiss();
    progress.value = withTiming(0, {
      duration: reducedMotion ? 0 : 260,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) scheduleOnRN(finishClosing);
    });
  };

  const morphStyle = useAnimatedStyle(() => ({
    width: buttonSize + (barWidth - buttonSize) * progress.value,
    transform: [{ translateY: -keyboardOffset.value * progress.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: 8 * (1 - progress.value) }],
  }));

  return (
    <>
      <View ref={buttonRef} collapsable={false} style={{
        position: "absolute", right: rightInset, bottom: dockHeight + 4,
        width: buttonSize, height: buttonSize,
      }}>
        {!anchor ? (
          <GlassSurface>
            <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
              accessibilityHint="Opens the search input"
              className="items-center justify-center rounded-full active:bg-secondary"
              style={{ width: buttonSize, height: buttonSize }}>
              <Icon family="Feather" name="search" size={22} accessible={false} className="text-foreground" />
            </Pressable>
          </GlassSurface>
        ) : null}
      </View>

      {anchor ? (
        // Covers the native header and sibling dock as well as the active list.
        <Modal transparent animationType="none" presentationStyle="overFullScreen"
          statusBarTranslucent navigationBarTranslucent onRequestClose={close}
          onShow={() => {
            if (!closing.current) {
              progress.value = withTiming(1, {
                duration: reducedMotion ? 0 : 340,
                easing: Easing.out(Easing.cubic),
              }, (finished) => {
                if (finished) scheduleOnRN(focusInput);
              });
            }
          }}>
          <View style={{ flex: 1 }} accessibilityViewIsModal onAccessibilityEscape={close}>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss search"
              onPress={close} style={StyleSheet.absoluteFill} />
            <Animated.View style={[
              { position: "absolute", top: anchor.top, right: anchor.right }, morphStyle,
            ]}>
              <GlassSurface>
                <View style={{ height: buttonSize, flexDirection: "row", alignItems: "center", overflow: "hidden", borderRadius: 28 }}>
                  <View style={{ width: buttonSize, height: buttonSize, alignItems: "center", justifyContent: "center" }}>
                    <Icon family="Feather" name="search" size={22} accessible={false} className="text-foreground" />
                  </View>
                  <Animated.View style={[{ flex: 1, minWidth: 0 }, labelStyle]}>
                    <Input ref={inputRef} type="search" variant="ghost"
                      placeholder={placeholder} accessibilityLabel={placeholder}
                      value={query} onChangeText={setQuery}
                      autoCapitalize="none" autoCorrect={false} submitBehavior="submit"
                      className="border-0 px-0 focus:border-transparent focus:outline-0" />
                  </Animated.View>
                  <Animated.View style={labelStyle}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={close}
                      className="items-center justify-center rounded-full active:bg-secondary"
                      style={{ width: 44, height: 44, marginRight: 6 }}>
                      <Icon family="Feather" name="x" size={20} accessible={false} className="text-muted-foreground" />
                    </Pressable>
                  </Animated.View>
                </View>
              </GlassSurface>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </>
  );
};
