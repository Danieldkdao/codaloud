import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View, useWindowDimensions } from "react-native";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";

import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText, PText } from "@/components/ui/text";

type ProjectWorkspacePlaceholderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  action?: ReactNode;
  centerInWindow?: boolean;
};

const WindowCenteredContent = ({
  children,
  dockHeight,
}: {
  children: ReactNode;
  dockHeight: number;
}) => {
  const ref = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const [paddingOffset, setPaddingOffset] = useState(0);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, contentHeight) => {
      // The native header is outside this view. Balance its actual window
      // position instead of centering in the space below that header.
      setPaddingOffset(2 * y + contentHeight - height);
    });
  }, [height]);
  useLayoutEffect(measure, [measure, width]);
  const bottomPadding = 24 + Math.max(dockHeight, paddingOffset);

  return (
    <View ref={ref} collapsable={false} className="flex-1" onLayout={measure}>
      <AppWrapper
        headerShown
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
          // Balance the dock clearance to preserve the window center while
          // allowing oversized content to scroll clear of the controls.
          paddingTop: bottomPadding - paddingOffset,
          paddingBottom: bottomPadding,
        }}
      >
        {children}
      </AppWrapper>
    </View>
  );
};

export const ProjectWorkspacePlaceholder = ({
  title,
  description,
  children,
  action,
  centerInWindow = false,
}: ProjectWorkspacePlaceholderProps) => {
  const { dockHeight } = useProjectWorkspaceDockHeight();
  const content = (
    <>
      {children}
      <HeadingText accessibilityRole="header" className="text-center text-3xl">
        {title}
      </HeadingText>
      {description ? (
        <PText className="text-center text-lg">{description}</PText>
      ) : null}
      {action ? <View className="pt-4">{action}</View> : null}
    </>
  );

  if (centerInWindow) {
    return (
      <WindowCenteredContent dockHeight={dockHeight}>
        {content}
      </WindowCenteredContent>
    );
  }

  return (
    <AppWrapper
      headerShown
      style={{ marginBottom: dockHeight }}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      contentContainerStyle={{
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      }}
    >
      {content}
    </AppWrapper>
  );
};
