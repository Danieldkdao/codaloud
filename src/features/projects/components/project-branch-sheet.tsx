import BottomSheet from "@expo/ui/community/bottom-sheet";
import { useEffect, useRef, type ReactNode } from "react";
import type { ColorValue } from "react-native";

export type ProjectBranchSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backgroundColor: ColorValue;
  children: ReactNode;
};

export const ProjectBranchSheet = ({ open, onOpenChange, backgroundColor, children }: ProjectBranchSheetProps) => {
  const ref = useRef<BottomSheet>(null);
  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.close();
  }, [open]);

  return (
    <BottomSheet ref={ref} index={-1} enableDynamicSizing enablePanDownToClose
      backgroundStyle={{ backgroundColor }} onChange={(index) => onOpenChange(index >= 0)}
      onClose={() => onOpenChange(false)}>
      {children}
    </BottomSheet>
  );
};
