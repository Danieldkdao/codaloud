import BottomSheet, { BottomSheetView } from "@expo/ui/community/bottom-sheet";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ScrollFadeFlatList } from "@/components/ui/scroll-fade-flat-list";
import { PText } from "@/components/ui/text";
import type { ProjectBranchData } from "@/features/projects/types";
import { useThemeColor } from "@/hooks/use-theme";

const branchSheetSnapPoints = ["60%"];

type ProjectBranchSelectProps = {
  branch: ProjectBranchData;
  branches: string[];
  onBranchChange: (name: string) => void;
};

export const ProjectBranchSelect = ({ branch, branches, onBranchChange }: ProjectBranchSelectProps) => {
  const sheetRef = useRef<BottomSheet>(null);
  const [open, setOpen] = useState(false);
  const card = useThemeColor("card");
  const close = () => sheetRef.current?.close();

  return (
    <>
      <Pressable
        onPress={() => sheetRef.current?.present()}
        accessibilityRole="button"
        accessibilityLabel={`Branch: ${branch.name}`}
        accessibilityHint="Opens available branches"
        accessibilityState={{ expanded: open }}
        className="size-12 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon family="Feather" name="git-branch" size={22} className="text-foreground" accessible={false} />
      </Pressable>
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={branchSheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: card }}
        onChange={(index) => setOpen(index >= 0)}
        onClose={() => setOpen(false)}
      >
        <BottomSheetView style={{ height: "100%" }}>
          <View className="flex-1 bg-card" accessibilityViewIsModal onAccessibilityEscape={close}>
            <View className="flex-row items-center justify-between border-b border-border px-5 py-2">
              <PText accessibilityRole="header" className="flex-1 text-lg font-medium">Branch</PText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close Branch" onPress={close}
                className="size-12 items-center justify-center rounded-full active:bg-secondary">
                <Icon family="Feather" name="x" size={22} className="text-foreground" accessible={false} />
              </Pressable>
            </View>
            <View className="min-h-0 flex-1">
              <ScrollFadeFlatList
                data={branches}
                extraData={branch.name}
                keyExtractor={(name) => name}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 4 }}
                ListHeaderComponent={
                  <PText accessibilityRole="header" className="px-5 pt-4 pb-2 text-muted-foreground">Branches</PText>
                }
                renderItem={({ item: name }) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={name}
                    accessibilityState={{ checked: branch.name === name }}
                    onPress={() => { close(); onBranchChange(name); }}
                    className="min-h-14 flex-row items-center gap-3 px-5 py-4 active:bg-secondary"
                  >
                    <PText className="min-w-0 flex-1 text-base text-foreground">{name}</PText>
                    {branch.name === name && (
                      <Icon family="Feather" name="check" size={22} className="text-foreground" accessible={false} />
                    )}
                  </Pressable>
                )}
              />
            </View>
            <View className="flex-row items-center gap-2 border-t border-border px-5 pt-1 pb-4">
              <Icon family="Feather" name="search" size={20} className="text-muted-foreground" accessible={false} />
              <Input type="search" variant="ghost" size="sm" placeholder="Search branches"
                accessibilityLabel="Search branches" autoCapitalize="none" autoCorrect={false}
                containerClassName="min-w-0 flex-1" className="border-0 px-0 py-1 focus:border-transparent focus:outline-0" />
            </View>
          </View>
        </BottomSheetView>
      </BottomSheet>
    </>
  );
};
