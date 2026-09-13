import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
  frame,
  ignoreSafeArea,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { View, useWindowDimensions } from "react-native";

import type { ContentSheetProps } from "./content-sheet";

export const ContentSheet = ({
  open,
  onOpenChange,
  backgroundColor,
  children,
}: ContentSheetProps) => {
  const { width } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState(0);

  return (
    <Host style={{ position: "absolute", width }} pointerEvents="none">
      <BottomSheet
        isPresented={open}
        onIsPresentedChange={onOpenChange}
        onDismiss={() => onOpenChange(false)}
      >
        <Group
          modifiers={[
            // Fill the sheet before ignoring its safe area so intrinsic content stays centered.
            frame({ maxHeight: Infinity, alignment: "center" }),
            ignoreSafeArea({ regions: "container", edges: "bottom" }),
            // The presenting screen's bottom inset differs from a floating sheet's;
            // subtracting it makes the sheet shorter than its measured content.
            presentationDetents([{ height: Math.max(1, contentHeight) }]),
            presentationDragIndicator("visible"),
            presentationBackground(backgroundColor),
          ]}
        >
          <RNHostView matchContents>
            <View
              style={{ width, paddingTop: 12 }}
              onLayout={({ nativeEvent }) =>
                setContentHeight(nativeEvent.layout.height)
              }
            >
              {children}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
};
