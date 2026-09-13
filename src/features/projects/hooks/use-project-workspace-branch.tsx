import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { ProjectGitTab } from "../types";

export type ProjectBranchSource = "local" | "remote";

type ProjectWorkspaceBranchState = {
  projectId: string;
  branch: string | null;
  branchSource: ProjectBranchSource | null;
  setBranch: (branch: string, source?: ProjectBranchSource) => void;
  isBranchLoading: boolean;
  setIsBranchLoading: (loading: boolean) => void;
  commitSearch: string;
  setCommitSearch: (search: string) => void;
  gitTab: ProjectGitTab;
  setGitTab: (tab: ProjectGitTab) => void;
};

const ProjectWorkspaceBranchContext = createContext<ProjectWorkspaceBranchState | null>(null);

export const ProjectWorkspaceBranchProvider = ({ children }: { children: ReactNode }) => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const session = useAuthSession();
  const userId = !session.isPending && !session.error ? session.data?.user.id ?? null : null;
  const [selection, setSelection] = useState<{ projectId: string; userId: string; branch: string; source: ProjectBranchSource } | null>(null);
  const branch = selection?.projectId === projectId && selection.userId === userId ? selection.branch : null;
  const [branchLoading, setBranchLoading] = useState<{ projectId: string; userId: string | null; loading: boolean } | null>(null);
  const setIsBranchLoading = useCallback((loading: boolean) => {
    setBranchLoading((previous) => previous?.projectId === projectId && previous.userId === userId && previous.loading === loading
      ? previous : { projectId, userId, loading });
  }, [projectId, userId]);
  // Before the picker reports its first query state, an unknown branch is still resolving.
  const isBranchLoading = branch === null && (session.isPending || Boolean(userId)) && (
    branchLoading?.projectId === projectId && branchLoading.userId === userId ? branchLoading.loading : true
  );
  const [historyView, setHistoryView] = useState({ projectId, userId, search: "", tab: "changes" as ProjectGitTab });
  const ownsHistoryView = historyView.projectId === projectId && historyView.userId === userId;
  const setCommitSearch = useCallback((search: string) => {
    setHistoryView({ projectId, userId, search, tab: "history" });
  }, [projectId, userId]);
  const setGitTab = useCallback((tab: ProjectGitTab) => {
    setHistoryView((previous) => {
      const sameWorkspace = previous.projectId === projectId && previous.userId === userId;
      if (sameWorkspace && previous.tab === tab) return previous;
      return { projectId, userId, search: sameWorkspace ? previous.search : "", tab };
    });
  }, [projectId, userId]);

  return (
    <ProjectWorkspaceBranchContext value={{
      projectId,
      branch,
      branchSource: branch === null ? null : selection?.source ?? "local",
      // Selection is local UI state; it never checks out a Git branch.
      setBranch: (name, source = "local") => { if (userId) setSelection({ projectId, userId, branch: name, source }); },
      isBranchLoading,
      setIsBranchLoading,
      commitSearch: ownsHistoryView ? historyView.search : "",
      setCommitSearch,
      gitTab: ownsHistoryView ? historyView.tab : "changes",
      setGitTab,
    }}>
      {children}
    </ProjectWorkspaceBranchContext>
  );
};

export const useProjectWorkspaceBranch = () => {
  const branch = useContext(ProjectWorkspaceBranchContext);
  if (!branch) throw new Error("useProjectWorkspaceBranch must be used within ProjectWorkspaceBranchProvider");
  return branch;
};
