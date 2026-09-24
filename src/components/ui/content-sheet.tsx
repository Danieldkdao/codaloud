import { KeyboardSymbolsProvider } from "@/components/keyboard-symbols-provider";
import BottomSheet from "@expo/ui/community/bottom-sheet";
import { useEffect, useRef, type ReactNode } from "react";
import type { ColorValue } from "react-native";
import { NativeContentSheet } from "./native-content-sheet";

export type ContentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismiss?: () => void;
  // Android background override; iOS uses the native form-sheet material.
  backgroundColor?: ColorValue;
  // iOS may scroll simple forms; self-scrolling layouts need a bounded viewport.
  scrollable?: boolean;
  children: ReactNode;
};

const AndroidContentSheet = ({
  open,
  onOpenChange,
  onDismiss,
  backgroundColor,
  children,
}: ContentSheetProps) => {
  const ref = useRef<BottomSheet>(null);
  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.close();
  }, [open]);

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      enableDynamicSizing
      enablePanDownToClose
      backgroundStyle={backgroundColor ? { backgroundColor } : undefined}
      onChange={(index) => onOpenChange(index >= 0)}
      onClose={() => {
        onOpenChange(false);
        onDismiss?.();
      }}
    >
      <KeyboardSymbolsProvider local>{children}</KeyboardSymbolsProvider>
    </BottomSheet>
  );
};

// Keep one public entry point for the native presentation on each platform.
// EXPO_OS is Expo's compile-time platform flag, not application configuration.
export const ContentSheet =
  process.env.EXPO_OS === "ios" ? NativeContentSheet : AndroidContentSheet;
