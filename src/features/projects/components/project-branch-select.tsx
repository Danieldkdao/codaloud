import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Pressable, View, useWindowDimensions } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useProjectBranches } from "@/features/projects/hooks/use-project-branches";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import type { ProjectBranchPageSchema, ProjectBranchSource } from "@/features/projects/actions/branch-schemas";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";
import { useThemeColor } from "@/hooks/use-theme";

import { ProjectBranchSection } from "./project-branch-section";
import { ContentSheet } from "@/components/ui/content-sheet";
import { useProject } from "../hooks/use-project";
import { useGitHubRepositoryBranches } from "@/services/github/hooks/use-github-repository-branches";
import type { GitHubRepositoryBranchPage, GitHubRepositoryBranch } from "@/services/github/types";
import { formatProjectBranchLabel } from "../lib/formatters";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useProjectFileSaveRegistry } from "../hooks/use-project-file-save";
import { useProjectWorkspaceCurrentFile } from "../hooks/use-project-workspace-current-file";
import { projectCommitParamsSchema } from "../lib/commit-params";

const getRemoteBranches = (page: GitHubRepositoryBranchPage) => page.branches;
const getRemoteBranchKey = (branch: GitHubRepositoryBranch) => branch.name;

const getBranches = (page: ProjectBranchPageSchema) => page.branches;
const getBranchKey = (branch: string) => branch;

type ProjectBranchSelectProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ProjectBranchSelect = ({ open: controlledOpen, onOpenChange }: ProjectBranchSelectProps = {}) => {
  const { width } = useWindowDimensions();
  const { projectId, branch, branchSource, setBranch, isBranchLoading, setIsBranchLoading, checkoutBranch, isCheckingOut, checkoutError, isCheckoutRecoveryRequired, retryCheckoutRecovery } = useProjectWorkspaceBranch();
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const userId = session.data?.user.id;
  const { flushPendingSaves } = useProjectFileSaveRegistry();
  const { filePath, refreshFile } = useProjectWorkspaceCurrentFile();
  const [search, setSearch] = useState("");
  const projectQuery = useProject(projectId);
  const repositoryId = projectQuery.data?.githubRepositoryId ?? undefined;
  const query = useProjectBranches(projectId, { search });
  const remoteQuery = useGitHubRepositoryBranches(repositoryId, { search, enabled: Boolean(repositoryId) });
  const remoteBranches = useUniquePaginatedItems(remoteQuery.data?.pages, getRemoteBranches, getRemoteBranchKey);
  const branches = useUniquePaginatedItems(query.data?.pages, getBranches, getBranchKey);
  const currentBranch = query.data?.pages[0]?.currentBranch;
  const loadingInitialBranches = !query.data && (query.isPending || query.isFetching);
  useEffect(() => {
    setIsBranchLoading(loadingInitialBranches);
  }, [loadingInitialBranches, setIsBranchLoading]);
  useEffect(() => {
    if (branch === null && currentBranch) setBranch(currentBranch);
  }, [branch, currentBranch, setBranch]);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const card = useThemeColor("card");
  const close = () => setOpen(false);
  useEffect(() => {
    if (checkoutError) Alert.alert("Couldn’t switch branches", checkoutError);
  }, [checkoutError]);
  const refreshWorkspace = async () => {
    if (userId) {
      const folders = { queryKey: ["projects", "files", userId, projectId] };
      await queryClient.cancelQueries(folders);
      // Keep folder data as readiness evidence, but discard branch-specific bytes
      // and pagination even when checkout's response was lost.
      await Promise.allSettled([
        queryClient.invalidateQueries(folders),
        queryClient.resetQueries({ queryKey: ["projects", "file", userId, projectId] }),
        queryClient.resetQueries({ queryKey: ["projects", "file-search", "infinite", userId, projectId] }),
        queryClient.resetQueries({
          queryKey: ["projects", "commits", "infinite", "cursor", userId, projectId],
          predicate: ({ queryKey }) => projectCommitParamsSchema.safeParse(queryKey[6]).data?.source === "local",
        }),
        queryClient.resetQueries({ queryKey: ["projects", "branches", "infinite", "cursor", userId, projectId, "local"] }),
      ]);
    }
    if (filePath) refreshFile(filePath);
  };
  const selectBranch = (name: string, source: ProjectBranchSource = "local") => {
    if (isCheckingOut) return;
    close();
    Keyboard.dismiss();
    checkoutBranch(name, async () => {
      await flushPendingSaves();
      const result = await query.checkout.mutateAsync(source === "remote" ? { branchName: name, source } : { branchName: name });
      await refreshWorkspace();
      return result;
    }, async () => {
      await refreshWorkspace();
      return query.recoverCheckout();
    });
  };

  return (
    <>
      <Pressable
        onPress={() => { if (isCheckoutRecoveryRequired) retryCheckoutRecovery(); else if (!isCheckingOut) setOpen(true); }}
        disabled={isCheckingOut && !isCheckoutRecoveryRequired}
        accessibilityRole="button"
        accessibilityLabel={isCheckoutRecoveryRequired ? "Retry branch recovery" : `Branch: ${formatProjectBranchLabel(branch, isBranchLoading)}`}
        accessibilityHint={isCheckoutRecoveryRequired ? "Confirms the current branch before editing resumes" : isCheckingOut ? "Switching branches. Please wait." : "Opens available branches"}
        accessibilityState={{ expanded: open, disabled: isCheckingOut && !isCheckoutRecoveryRequired, busy: isCheckingOut }}
        className="size-12 items-center justify-center rounded-full active:bg-secondary"
      >
        {isCheckingOut && !isCheckoutRecoveryRequired ? <ActivityIndicator className="text-foreground" /> : <Icon family="MaterialCommunityIcons" name="source-branch" size={26} className="text-foreground" accessible={false} />}
      </Pressable>
      <ContentSheet open={open && !isCheckingOut} onOpenChange={(value) => { if (!value || !isCheckingOut) setOpen(value); }} backgroundColor={card}>
        {/* Native content fitting measures both axes; constrain width while leaving height intrinsic. */}
        <View style={{ width }}>
          <View accessibilityViewIsModal onAccessibilityEscape={close}>
            <View className="shrink-0 border-b border-border px-5 pt-2 pb-3">
              <View className="flex-row items-center gap-2">
                <Icon family="Feather" name="search" size={20} className="text-muted-foreground" accessible={false} />
                <Input type="search" variant="ghost" size="sm" placeholder="Search branches or type to create a new one."
                  accessibilityLabel="Search branches" autoCapitalize="none" autoCorrect={false}
                  value={search} onChangeText={setSearch} editable={!isCheckingOut} maxLength={200}
                  containerClassName="min-w-0 flex-1" className="border-0 px-0 py-1 focus:border-transparent focus:outline-0" />
              </View>
            </View>
            <View>
              <ProjectBranchSection source="local" branches={branches} selectedBranch={branchSource === "local" ? branch : null}
                search={search} open={open} query={query} disabled={isCheckingOut} onSelect={selectBranch} />
              <View className="h-px shrink-0 bg-border" />
              {repositoryId ? (
                <ProjectBranchSection source="remote" branches={remoteBranches.map(({ name }) => name)} selectedBranch={branchSource === "remote" ? branch : null}
                  search={search} open={open} query={remoteQuery} disabled={isCheckingOut} onSelect={(name) => selectBranch(name, "remote")} />
              ) : (
                <View className="gap-3 px-5 py-4">
                  <View className="flex-row items-center gap-2">
                    <Icon family="Feather" name="cloud" size={18} className="text-muted-foreground" accessible={false} />
                    <PText accessibilityRole="header" className="text-base font-medium">Remote branches</PText>
                  </View>
                  <PText className="text-base text-muted-foreground">
                    {projectQuery.isPending ? "Loading repository…" : projectQuery.error ? "Unable to load the project’s repository." : "No GitHub repository connected."}
                  </PText>
                  {projectQuery.error && <Button variant="outline" onPress={() => { void projectQuery.refetch(); }}>Try again</Button>}
                </View>
              )}
            </View>
          </View>
        </View>
      </ContentSheet>
    </>
  );
};
