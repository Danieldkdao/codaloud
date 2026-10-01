import { useEffect, useRef, type ReactNode } from "react";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useVoiceConversation } from "./use-voice-conversation";
import { WorkspaceVoiceContext } from "./workspace-voice-provider";
import { CommandBubbleVisibleContext } from "./use-command-bubble-layout";
import { registerCommandNavigation } from "../command-navigation";
import { createCommandNavigator } from "../command-navigator";
import { commandCenter } from "../command-center";
import { VoiceTranscriptBubble } from "../components/voice-transcript-bubble";
import { VoiceCommandOverlay } from "../components/voice-command-overlay";
import { inlineSession } from "../inline-session";
import { useAgentTasks } from "@/features/agent/hooks/use-agent-tasks";

export const AppCommandProvider = ({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) => {
  const params = useGlobalSearchParams<{
    projectId?: string;
    draftId?: string;
  }>();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = pathname.startsWith("/projects/")
    ? params.projectId
    : undefined;
  const inProject = enabled && Boolean(projectId);
  const active = inProject && pathname === `/projects/${projectId}/code`;
  const activeProject = useRef<string | undefined>(projectId);
  activeProject.current = active ? projectId : undefined;
  const hasTasks = useAgentTasks().some(
    (task) => task.request.projectId === projectId && !task.reviewed,
  );
  // Supporting routes retain the controller but stop microphone capture.
  const conversation = useVoiceConversation(
    active,
    `project:${projectId ?? "none"}`,
    projectId,
    false,
  );
  useEffect(
    () =>
      registerCommandNavigation(
        createCommandNavigator(router, () => activeProject.current),
      ),
    [router],
  );
  useEffect(() => {
    commandCenter.clear();
    inlineSession.cancel();
    if (!active) conversation.stop();
    return () => {
      commandCenter.clear();
      inlineSession.cancel();
    };
  }, [active, projectId]);
  return (
    <WorkspaceVoiceContext value={inProject ? conversation : null}>
      <CommandBubbleVisibleContext value={active && hasTasks}>
        {children}
        {active ? (
          <VoiceCommandOverlay scope={pathname}>
            {(maxHeight) => (
              <VoiceTranscriptBubble
                conversation={conversation}
                projectId={projectId}
                hasTasks={hasTasks}
                maxHeight={maxHeight}
              />
            )}
          </VoiceCommandOverlay>
        ) : null}
      </CommandBubbleVisibleContext>
    </WorkspaceVoiceContext>
  );
};
