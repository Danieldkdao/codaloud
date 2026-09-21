import { useEffect, useRef, useState } from "react";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { usePathname } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "@/components/ui/glass-surface";
import { useVoiceConversation } from "@/features/voice/hooks/use-voice-conversation";
import { VoiceMicrophone } from "@/features/voice/components/voice-microphone";
import { VoiceTranscriptBubble } from "@/features/voice/components/voice-transcript-bubble";

import {
  ProjectActionButtonsLeft,
  ProjectActionButtonsRight,
} from "@/features/projects/components/project-action-buttons";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { ProjectBranchMenu } from "./project-branch-menu";

export const ProjectWorkspaceDock = ({
  tab,
}: { tab?: "code" | "git" } = {}) => {
  const keyboardFrame = useKeyboardFrame();
  const { setDockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const branchIndicatorRef = useRef<View>(null);
  const [isGitSearchOpen, setIsGitSearchOpen] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const pathname = usePathname();
  // Keep the editor controls stable while a supporting modal covers them.
  const routeName = tab ?? pathname.split("/")[3];
  const activeTab = routeName === "git" ? "git" : "code";
  // Preserve six 44-point targets plus the 56-point microphone on small phones.
  // Wider phones share the extra room between larger targets and real gaps.
  const safeWidth = width - insets.left - insets.right;
  const horizontalPadding =
    activeTab === "code"
      ? Math.min(12, Math.max(0, (safeWidth - 320) / 2))
      : 16;
  const actionGap =
    activeTab === "code"
      ? Math.min(4, Math.max(0, (safeWidth - horizontalPadding * 2 - 320) / 12))
      : 0;
  const branchSelection = useProjectWorkspaceBranch();
  const isGit = activeTab === "git";
  const conversation = useVoiceConversation(
    !isGit && !keyboardFrame,
    `${branchSelection.projectId}:${pathname}`,
  );
  useEffect(() => {
    setBranchPickerOpen(false);
  }, [branchSelection.projectId, activeTab]);

  return (
    <View
      testID="project-workspace-dock"
      collapsable={false}
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        if (height > 0) setDockHeight(height);
      }}
      style={{
        position: "absolute",
        // Android resizes the screen above its keyboard; hide the voice dock
        // there so the editor accessory is the only row touching the keyboard.
        display: activeTab === "code" && keyboardFrame ? "none" : "flex",
        // Keep the controls above the native tab screen and its editor WebView.
        zIndex: 10,
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: "box-none",
        paddingLeft: horizontalPadding + insets.left,
        paddingRight: horizontalPadding + insets.right,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <VoiceTranscriptBubble conversation={conversation} />
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
                className="min-h-18 flex-row items-center py-2"
                style={{
                  paddingHorizontal: activeTab === "code" ? 0 : 8,
                  gap: actionGap,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: actionGap,
                  }}
                >
                  <ProjectActionButtonsLeft
                    tab={activeTab}
                    branchPickerOpen={branchPickerOpen}
                    onBranchPickerOpenChange={setBranchPickerOpen}
                  />
                </View>
                {!isGit && <VoiceMicrophone conversation={conversation} />}
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: actionGap,
                  }}
                >
                  <ProjectActionButtonsRight
                    tab={activeTab}
                    branchIndicatorRef={branchIndicatorRef}
                    onGitSearchOpenChange={setIsGitSearchOpen}
                  />
                </View>
              </View>
            </GlassSurface>
          </View>
        </View>
      </View>
    </View>
  );
};
