import { createContext, type ReactNode } from "react";
import { useLocalSearchParams, usePathname } from "expo-router";
import {
  useVoiceConversation,
  type VoiceConversation,
} from "./use-voice-conversation";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";

export const WorkspaceVoiceContext = createContext<VoiceConversation | null>(
  null,
);
export const WorkspaceVoiceProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const pathname = usePathname();
  const { branch, isWorkspaceBusy } = useProjectWorkspaceBranch();
  const conversation = useVoiceConversation(
    !isWorkspaceBusy && pathname.endsWith("/code"),
    `${projectId}:${branch}:${pathname}`,
    projectId,
  );
  return (
    <WorkspaceVoiceContext value={conversation}>
      {children}
    </WorkspaceVoiceContext>
  );
};
