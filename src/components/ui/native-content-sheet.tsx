import { useEffect, useId, useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { ScreenStack, ScreenStackItem } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ContentSheetProps } from "./content-sheet";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { useThemeColor } from "@/hooks/use-theme";
import { FORM_SHEET_OPTIONS } from "@/lib/constants";

/** The same UIKit presenter used by Expo Router's New Project form sheet. */
export const NativeContentSheet = ({
  open,
  onOpenChange,
  onDismiss,
  scrollable = true,
  liquidGlass = false,
  children,
}: ContentSheetProps) => {
  const id = useId();
  const background = useThemeColor("background");
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardFrame();
  const availableHeight = Math.min(height, keyboard?.screenY ?? height);
  const dismissalPending = useRef(open);
  const presentation = useMemo(() => ({ active: true }), [open]);
  useEffect(() => {
    presentation.active = true;
    if (open) dismissalPending.current = true;
    return () => {
      presentation.active = false;
    };
  }, [open, presentation]);
  const finishDismissal = () => {
    if (!dismissalPending.current) return;
    dismissalPending.current = false;
    onDismiss?.();
  };

  return (
    <ScreenStack
      style={StyleSheet.absoluteFill}
      // The presented controller has its own touch hierarchy. The empty local
      // presenter must never intercept the workspace's buttons after dismissal.
      pointerEvents="none"
      onFinishTransitioning={() => {
        if (!open && presentation.active) finishDismissal();
      }}
    >
      {/* A non-interactive local presenter keeps this a component, not a route. */}
      <ScreenStackItem
        screenId={`${id}-presenter`}
        activityState={2}
        headerConfig={{ hidden: true }}
        style={StyleSheet.absoluteFill}
        contentStyle={{ backgroundColor: "transparent" }}
        pointerEvents="none"
      />
      {open && (
        <ScreenStackItem
          screenId={`${id}-sheet`}
          activityState={2}
          stackPresentation="formSheet"
          {...FORM_SHEET_OPTIONS}
          headerConfig={{ hidden: true }}
          contentStyle={{
            backgroundColor: liquidGlass ? "transparent" : background,
          }}
          style={StyleSheet.absoluteFill}
          onDismissed={() => {
            if (!presentation.active || !dismissalPending.current) return;
            onOpenChange(false);
            finishDismissal();
          }}
        >
          <View
            testID="native-sheet-content"
            collapsable={false}
            style={{
              // fitToContents adds a native bottom inset. Reserve it separately
              // while editing so the sheet stays above the keyboard.
              maxHeight: Math.max(
                120,
                availableHeight -
                  insets.top -
                  insets.bottom * (keyboard ? 2 : 1),
              ),
              paddingTop: 20,
              // Match New Project's inset compensation only with the keyboard shut;
              // applying it while editing would pull the footer into the accessory.
              marginBottom: keyboard ? 0 : -insets.bottom,
            }}
          >
            {/* Match New Project: stop UIKit from resizing a nested form scroller. */}
            <View collapsable={false} pointerEvents="none" />
            {scrollable ? (
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentInsetAdjustmentBehavior="never"
              >
                {children}
              </ScrollView>
            ) : (
              <View style={{ flexShrink: 1 }}>{children}</View>
            )}
          </View>
        </ScreenStackItem>
      )}
    </ScreenStack>
  );
};
