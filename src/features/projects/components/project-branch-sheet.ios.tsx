import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import { ignoreSafeArea, presentationBackground, presentationDetents, presentationDragIndicator } from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ProjectBranchSheetProps } from "./project-branch-sheet";

export const ProjectBranchSheet = ({ open, onOpenChange, backgroundColor, children }: ProjectBranchSheetProps) => {
  const { width } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const [contentHeight, setContentHeight] = useState(0);

  return (
    <Host style={{ position: "absolute", width }} pointerEvents="none">
      <BottomSheet isPresented={open} onIsPresentedChange={onOpenChange} onDismiss={() => onOpenChange(false)}>
        <Group modifiers={[
          // A height detent adds the bottom safe area. Account for it once, and
          // let the hosted content occupy that space without ignoring the keyboard.
          ignoreSafeArea({ regions: "container", edges: "bottom" }),
          presentationDetents([{ height: Math.max(1, contentHeight - bottom) }]),
          presentationDragIndicator("visible"),
          presentationBackground(backgroundColor),
        ]}>
          <RNHostView matchContents>
            <View style={{ width, paddingTop: 24 }} onLayout={({ nativeEvent }) => setContentHeight(nativeEvent.layout.height)}>
              {children}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
};
