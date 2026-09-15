import {
  createContext,
  useCallback,
  useContext,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useLocalSearchParams } from "expo-router";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { ProjectGitTab } from "../types";
import type { ProjectBranchCheckoutSchema } from "../actions/branch-schemas";

import type { ProjectBranchSource } from "../actions/branch-schemas";
export type { ProjectBranchSource } from "../actions/branch-schemas";

type ProjectWorkspaceBranchState = {
  projectId: string;
  branch: string | null;
  branchSource: ProjectBranchSource | null;
  setBranch: (branch: string, source?: ProjectBranchSource) => void;
  checkoutBranch: (
    branch: string,
    action: () => Promise<ProjectBranchCheckoutSchema>,
    recover?: () => Promise<ProjectBranchCheckoutSchema>,
  ) => void;
  isCheckingOut: boolean;
  isCheckoutRecoveryRequired: boolean;
  retryCheckoutRecovery: () => void;
  checkoutError: string | null;
  isBranchLoading: boolean;
  setIsBranchLoading: (loading: boolean) => void;
  commitSearch: string;
  setCommitSearch: (search: string) => void;
  gitTab: ProjectGitTab;
  setGitTab: (tab: ProjectGitTab) => void;
};

const ProjectWorkspaceBranchContext =
  createContext<ProjectWorkspaceBranchState | null>(null);

export const ProjectWorkspaceBranchProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const session = useAuthSession();
  const userId =
    !session.isPending && !session.error
      ? (session.data?.user.id ?? null)
      : null;
  return (
    <ProjectWorkspaceBranchStateProvider
      key={`${projectId}/${userId}`}
      projectId={projectId}
      userId={userId}
      sessionPending={session.isPending}
    >
      {children}
    </ProjectWorkspaceBranchStateProvider>
  );
};

const ProjectWorkspaceBranchStateProvider = ({
  projectId,
  userId,
  sessionPending,
  children,
}: {
  projectId: string;
  userId: string | null;
  sessionPending: boolean;
  children: ReactNode;
}) => {
  const [selection, setSelection] = useState<{
    projectId: string;
    userId: string;
    branch: string;
    source: ProjectBranchSource;
  } | null>(null);
  const [optimisticSelection, setOptimisticSelection] =
    useOptimistic(selection);
  const [isPending, startCheckout] = useTransition();
  const [isCheckoutRecoveryRequired, setIsCheckoutRecoveryRequired] =
    useState(false);
  const recoveryAction = useRef<
    (() => Promise<ProjectBranchCheckoutSchema>) | undefined
  >(undefined);
  const isCheckingOut = isPending || isCheckoutRecoveryRequired;
  const checkoutInFlight = useRef(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const branch = isCheckoutRecoveryRequired
    ? null
    : (optimisticSelection?.branch ?? null);
  const recoverCheckout = async () => {
    try {
      if (!recoveryAction.current || !userId)
        throw new Error("Reopen the project to confirm the current branch.");
      const result = await recoveryAction.current();
      startCheckout(() => {
        setSelection({
          projectId,
          userId,
          branch: result.currentBranch,
          source: "local",
        });
        setIsCheckoutRecoveryRequired(false);
        setCheckoutError(null);
      });
      recoveryAction.current = undefined;
    } catch (error) {
      startCheckout(() =>
        setCheckoutError(
          error instanceof Error
            ? error.message
            : "Unable to confirm the current branch. Retry recovery.",
        ),
      );
    }
  };
  const retryCheckoutRecovery = () => {
    if (!isCheckoutRecoveryRequired || checkoutInFlight.current || isPending)
      return;
    checkoutInFlight.current = true;
    setCheckoutError(null);
    startCheckout(async () => {
      try {
        await recoverCheckout();
      } finally {
        checkoutInFlight.current = false;
      }
    });
  };
  const checkoutBranch: ProjectWorkspaceBranchState["checkoutBranch"] = (
    name,
    action,
    recover,
  ) => {
    if (
      !userId ||
      checkoutInFlight.current ||
      isCheckingOut ||
      (selection?.branch === name && selection.source === "local")
    )
      return;
    // Close the same-tick gap before React commits the disabled picker.
    checkoutInFlight.current = true;
    setCheckoutError(null);
    startCheckout(async () => {
      setOptimisticSelection({
        projectId,
        userId,
        branch: name,
        source: "local",
      });
      try {
        const result = await action();
        // Commit the base value in this transition before optimism is removed.
        // Waiting for a later query refresh here would briefly restore the old branch.
        startCheckout(() =>
          setSelection({
            projectId,
            userId,
            branch: result.currentBranch,
            source: "local",
          }),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "CHECKOUT_OUTCOME_UNKNOWN"
        ) {
          recoveryAction.current = recover;
          // A lost response cannot establish either branch. Keep every existing
          // checkout guard active until an authoritative read resolves the state.
          startCheckout(() => {
            setSelection(null);
            setIsCheckoutRecoveryRequired(true);
          });
          await recoverCheckout();
        } else {
          startCheckout(() =>
            setCheckoutError(
              error instanceof Error
                ? error.message
                : "Unable to switch branches. Please try again.",
            ),
          );
        }
      } finally {
        checkoutInFlight.current = false;
      }
    });
  };
  const [branchLoading, setBranchLoading] = useState<{
    projectId: string;
    userId: string | null;
    loading: boolean;
  } | null>(null);
  const setIsBranchLoading = useCallback(
    (loading: boolean) => {
      setBranchLoading((previous) =>
        previous?.projectId === projectId &&
        previous.userId === userId &&
        previous.loading === loading
          ? previous
          : { projectId, userId, loading },
      );
    },
    [projectId, userId],
  );
  // Before the picker reports its first query state, an unknown branch is still resolving.
  const isBranchLoading =
    branch === null &&
    (sessionPending || Boolean(userId)) &&
    (branchLoading?.projectId === projectId && branchLoading.userId === userId
      ? branchLoading.loading
      : true);
  const [historyView, setHistoryView] = useState({
    projectId,
    userId,
    search: "",
    tab: "changes" as ProjectGitTab,
  });
  const ownsHistoryView =
    historyView.projectId === projectId && historyView.userId === userId;
  const setCommitSearch = useCallback(
    (search: string) => {
      setHistoryView({ projectId, userId, search, tab: "history" });
    },
    [projectId, userId],
  );
  const setGitTab = useCallback(
    (tab: ProjectGitTab) => {
      setHistoryView((previous) => {
        const sameWorkspace =
          previous.projectId === projectId && previous.userId === userId;
        if (sameWorkspace && previous.tab === tab) return previous;
        return {
          projectId,
          userId,
          search: sameWorkspace ? previous.search : "",
          tab,
        };
      });
    },
    [projectId, userId],
  );

  return (
    <ProjectWorkspaceBranchContext
      value={{
        projectId,
        branch,
        branchSource: optimisticSelection?.source ?? null,
        // Initial reads must not overwrite an active checkout.
        setBranch: (name, source = "local") => {
          if (userId && !checkoutInFlight.current && !isCheckingOut)
            setSelection({ projectId, userId, branch: name, source });
        },
        checkoutBranch,
        isCheckingOut,
        isCheckoutRecoveryRequired,
        retryCheckoutRecovery,
        checkoutError,
        isBranchLoading,
        setIsBranchLoading,
        commitSearch: ownsHistoryView ? historyView.search : "",
        setCommitSearch,
        gitTab: ownsHistoryView ? historyView.tab : "changes",
        setGitTab,
      }}
    >
      {children}
    </ProjectWorkspaceBranchContext>
  );
};

export const useProjectWorkspaceBranch = () => {
  const branch = useContext(ProjectWorkspaceBranchContext);
  if (!branch)
    throw new Error(
      "useProjectWorkspaceBranch must be used within ProjectWorkspaceBranchProvider",
    );
  return branch;
};
