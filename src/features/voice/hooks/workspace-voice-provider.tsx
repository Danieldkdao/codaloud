import { createContext, type ReactNode } from "react";
import { useLocalSearchParams, usePathname } from "expo-router";
import {
  useVoiceConversation,
  type VoiceConversation,
} from "./use-voice-conversation";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { inlineAcceptanceOperation } from "../constants";

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
  const { branch, isWorkspaceBusy, workspaceOperation } =
    useProjectWorkspaceBranch();
  const conversation = useVoiceConversation(
    (!isWorkspaceBusy || workspaceOperation === inlineAcceptanceOperation) &&
      pathname.endsWith("/code"),
    `${projectId}:${branch}:${pathname}`,
    projectId,
  );
  return (
    <WorkspaceVoiceContext value={conversation}>
      {children}
    </WorkspaceVoiceContext>
  );
};
