import { useContext, useEffect, useRef, useState } from "react";
import { WorkspaceVoiceContext } from "@/features/voice/hooks/workspace-voice-provider";
import type { VoiceConversation } from "@/features/voice/hooks/use-voice-conversation";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { usePathname } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TaskStatusBar } from "@/features/agent/components/task-status-bar";
import { ImplementationPlanReview } from "@/features/agent/components/implementation-plan-review";
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

export const ProjectWorkspaceDock = (props: { tab?: "code" | "git" } = {}) => {
  const conversation = useContext(WorkspaceVoiceContext);
  return conversation ? (
    <WorkspaceDock {...props} conversation={conversation} />
  ) : (
    <StandaloneDock {...props} />
  );
};
const StandaloneDock = (props: { tab?: "code" | "git" }) => {
  const pathname = usePathname();
  const { projectId } = useProjectWorkspaceBranch();
  const conversation = useVoiceConversation(
    props.tab !== "git",
    `${projectId}:${pathname}`,
    projectId,
  );
  return <WorkspaceDock {...props} conversation={conversation} />;
};
const WorkspaceDock = ({
  tab,
  conversation,
}: {
  tab?: "code" | "git";
  conversation: VoiceConversation;
}) => {
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
  // Give two actions on each side of the microphone matching, flexible space.
  const safeWidth = width - insets.left - insets.right;
  const horizontalPadding =
    activeTab === "code"
      ? Math.min(20, Math.max(8, (safeWidth - 320) / 2))
      : 16;
  const actionGap = activeTab === "code" ? 8 : 0;
  const branchSelection = useProjectWorkspaceBranch();
  const isGit = activeTab === "git";
  useEffect(() => {
    setBranchPickerOpen(false);
  }, [branchSelection.projectId, activeTab]);

  return (
    <View
      testID="project-workspace-dock"
      collapsable={false}
      onLayout={(event) => {
        // Reserve the whole stack, including live tasks and the transcript, so
        // the editor's animated accessory row always sits above visible content.
        const height = event.nativeEvent.layout.height;
        if (height > 0) setDockHeight(height);
      }}
      style={{
        position: "absolute",
        // Keep the controls above the native tab screen and its editor WebView.
        zIndex: 10,
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: "box-none",
      }}
    >
      <View
        style={{
          display: activeTab === "code" && keyboardFrame ? "none" : "flex",
        }}
      >
        {!isGit && <TaskStatusBar projectId={branchSelection.projectId} />}
        <VoiceTranscriptBubble conversation={conversation} />
      </View>
      {!isGit && (
        <ImplementationPlanReview
          projectId={branchSelection.projectId}
          triggerVisible={!keyboardFrame}
        />
      )}
      <View
        className="w-full"
        collapsable={false}
        style={{
          // Keep the native review sheet mounted while its correction field has
          // focus; only the editor's dock controls hide above the keyboard.
          display: activeTab === "code" && keyboardFrame ? "none" : "flex",
          gap: 10,
          pointerEvents: "box-none",
          paddingLeft: horizontalPadding + insets.left,
          paddingRight: horizontalPadding + insets.right,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
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
