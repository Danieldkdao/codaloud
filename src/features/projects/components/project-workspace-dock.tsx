import { useEffect, useRef, useState } from "react";
import { usePathname } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";

import { ProjectWorkspaceTabSelect } from "@/features/projects/components/project-workspace-tab-select";
import {
  ProjectActionButtonsLeft,
  ProjectActionButtonsRight,
} from "@/features/projects/components/project-action-buttons";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectBranchMenu } from "./project-branch-menu";

export const ProjectWorkspaceDock = () => {
  const { setDockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const dockRef = useRef<View>(null);
  const branchIndicatorRef = useRef<View>(null);
  const [isGitSearchOpen, setIsGitSearchOpen] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const pathname = usePathname();
  // The workspace tab precedes any nested screens, such as files/preview.
  const routeName = pathname.split("/")[3];
  const activeTab =
    routeName === "code" || routeName === "git" || routeName === "agent"
      ? routeName
      : "files";
  const branchSelection = useProjectWorkspaceBranch();
  const isGit = activeTab === "git";
  useEffect(() => {
    setBranchPickerOpen(false);
  }, [branchSelection.projectId, activeTab]);

  return (
    <View
      testID="project-workspace-dock"
      ref={dockRef}
      collapsable={false}
      onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        // Keep the controls above the native tab screen and its editor WebView.
        zIndex: 10,
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: "box-none",
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <View className="w-full" style={{ gap: 10, pointerEvents: "box-none" }}>
        {isGit ? (
          <View
            ref={branchIndicatorRef}
            collapsable={false}
            className="items-center justify-center"
            style={{ height: 56 }}
          >
            {!isGitSearchOpen ? (
              <ProjectBranchMenu
                maxWidth={width - 32 - insets.left - insets.right}
                onChangeBranch={() => setBranchPickerOpen(true)}
              />
            ) : null}
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <GlassSurface borderRadius={36}>
              <View
                className="flex-row items-center py-2"
                style={{ paddingHorizontal: activeTab === "code" ? 0 : 8 }}
              >
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <ProjectActionButtonsLeft
                    tab={activeTab}
                    branchPickerOpen={branchPickerOpen}
                    onBranchPickerOpenChange={setBranchPickerOpen}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Microphone"
                  className="size-14 items-center justify-center rounded-full bg-primary active:bg-primary/90"
                >
                  <Icon
                    family="Feather"
                    name="mic"
                    size={24}
                    accessible={false}
                    className="text-primary-foreground"
                  />
                </Pressable>
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <ProjectActionButtonsRight
                    tab={activeTab}
                    dockRef={dockRef}
                    branchIndicatorRef={branchIndicatorRef}
                    onGitSearchOpenChange={setIsGitSearchOpen}
                  />
                </View>
              </View>
            </GlassSurface>
          </View>
          <ProjectWorkspaceTabSelect tab={activeTab} />
        </View>
      </View>
    </View>
  );
};
