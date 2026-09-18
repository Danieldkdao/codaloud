import { ProjectBranchCreate } from "./project-branch-create";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useProjectBranches } from "@/features/projects/hooks/use-project-branches";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import type {
  ProjectBranchPageSchema,
  ProjectBranchSource,
} from "@/features/projects/actions/branch-schemas";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";
import { useThemeColor } from "@/hooks/use-theme";

import { ProjectBranchSection } from "./project-branch-section";
import { ContentSheet } from "@/components/ui/content-sheet";
import { useProject } from "../hooks/use-project";
import { useProjectRemoteBranches } from "../hooks/use-project-remote-branches";
import { formatProjectBranchLabel } from "../lib/formatters";
import { useDeviceWorkspace } from "@/features/workspace/hooks/use-device-workspace";
import { useProjectFileSaveRegistry } from "../hooks/use-project-file-save";
import { useProjectWorkspaceCurrentFile } from "../hooks/use-project-workspace-current-file";
import { projectCommitParamsSchema } from "../lib/commit-params";

const getBranches = (page: ProjectBranchPageSchema) => page.branches;
const getBranchKey = (branch: string) => branch;

type ProjectBranchSelectProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ProjectBranchSelect = ({
  open: controlledOpen,
  onOpenChange,
}: ProjectBranchSelectProps = {}) => {
  const { width } = useWindowDimensions();
  const {
    projectId,
    branch,
    branchSource,
    setBranch,
    isBranchLoading,
    setIsBranchLoading,
    checkoutBranch,
    isWorkspaceBusy,
    workspaceOperation,
    assertWorkspaceCurrent,
    checkoutError,
    isCheckoutRecoveryRequired,
    retryCheckoutRecovery,
  } = useProjectWorkspaceBranch();
  const queryClient = useQueryClient();
  const device = useDeviceWorkspace();
  const userId = device.workspace?.ownerId;
  const { withSavedFiles } = useProjectFileSaveRegistry();
  const { refreshFiles } = useProjectWorkspaceCurrentFile();
  const [search, setSearch] = useState("");
  const projectQuery = useProject(projectId);
  const repositoryId = projectQuery.data?.githubRepositoryId ?? undefined;
  const query = useProjectBranches(projectId, { search });
  const remoteQuery = useProjectRemoteBranches(projectId, {
    search,
    enabled: Boolean(repositoryId),
  });
  const remoteBranches = useUniquePaginatedItems(
    remoteQuery.data?.pages,
    getBranches,
    getBranchKey,
  );
  const branches = useUniquePaginatedItems(
    query.data?.pages,
    getBranches,
    getBranchKey,
  );
  const currentBranch = query.data?.pages[0]?.currentBranch;
  const loadingInitialBranches =
    !query.data && (query.isPending || query.isFetching);
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
        queryClient.resetQueries({
          queryKey: ["projects", "file", userId, projectId],
        }),
        queryClient.resetQueries({
          queryKey: ["projects", "file-search", "infinite", userId, projectId],
        }),
        queryClient.resetQueries({
          queryKey: [
            "projects",
            "commits",
            "infinite",
            "cursor",
            userId,
            projectId,
          ],
          predicate: ({ queryKey }) =>
            projectCommitParamsSchema.safeParse(queryKey[6]).data?.source ===
            "local",
        }),
        queryClient.resetQueries({
          queryKey: [
            "projects",
            "branches",
            "infinite",
            "cursor",
            userId,
            projectId,
            "local",
          ],
        }),
      ]);
    }
    refreshFiles();
  };
  const selectBranch = (
    name: string,
    source: ProjectBranchSource = "local",
  ) => {
    if (isWorkspaceBusy) return;
    close();
    Keyboard.dismiss();
    checkoutBranch(
      name,
      () =>
        withSavedFiles(async () => {
          assertWorkspaceCurrent();
          const result = await query.gitCheckout.mutateAsync(
            source === "remote"
              ? { branchName: name, source }
              : { branchName: name },
          );
          assertWorkspaceCurrent();
          await refreshWorkspace();
          return result;
        }),
      async () => {
        assertWorkspaceCurrent();
        await refreshWorkspace();
        return query.recoverCheckout();
      },
    );
  };

  return (
    <>
      <Pressable
        onPress={() => {
          if (isCheckoutRecoveryRequired) retryCheckoutRecovery();
          else if (!isWorkspaceBusy) setOpen(true);
        }}
        disabled={isWorkspaceBusy && !isCheckoutRecoveryRequired}
        accessibilityRole="button"
        accessibilityLabel={
          isCheckoutRecoveryRequired
            ? "Retry branch recovery"
            : `Branch: ${formatProjectBranchLabel(branch, isBranchLoading)}`
        }
        accessibilityHint={
          isCheckoutRecoveryRequired
            ? "Confirms the current branch before editing resumes"
            : isWorkspaceBusy
              ? "A workspace operation is running. Please wait."
              : "Opens available branches"
        }
        accessibilityState={{
          expanded: open,
          disabled: isWorkspaceBusy && !isCheckoutRecoveryRequired,
          busy: isWorkspaceBusy,
        }}
        className="size-12 items-center justify-center rounded-full active:bg-secondary"
      >
        {isWorkspaceBusy && !isCheckoutRecoveryRequired ? (
          <ActivityIndicator className="text-foreground" />
        ) : (
          <Icon
            family="MaterialCommunityIcons"
            name="source-branch"
            size={26}
            className="text-foreground"
            accessible={false}
          />
        )}
      </Pressable>
      <ContentSheet
        open={
          open &&
          (!isWorkspaceBusy || workspaceOperation === "Creating branch…")
        }
        onOpenChange={(value) => {
          if (!value || !isWorkspaceBusy) setOpen(value);
        }}
        backgroundColor={card}
      >
        {/* Native content fitting measures both axes; constrain width while leaving height intrinsic. */}
        <View style={{ width }}>
          <View accessibilityViewIsModal onAccessibilityEscape={close}>
            <View className="shrink-0 border-b border-border px-5 pt-2 pb-3">
              <View className="flex-row items-center gap-2">
                <Icon
                  family="Feather"
                  name="search"
                  size={20}
                  className="text-muted-foreground"
                  accessible={false}
                />
                <Input
                  type="search"
                  variant="ghost"
                  size="sm"
                  placeholder="Search branches or type to create a new one."
                  accessibilityLabel="Search branches"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={search}
                  onChangeText={setSearch}
                  editable={!isWorkspaceBusy}
                  maxLength={200}
                  containerClassName="min-w-0 flex-1"
                  className="border-0 px-0 py-1 focus:border-transparent focus:outline-0"
                />
              </View>
            </View>
            <View>
              <ProjectBranchCreate
                name={search}
                exists={branches.includes(search)}
                onCreated={() => {
                  close();
                  setSearch("");
                  Keyboard.dismiss();
                }}
              />
              <ProjectBranchSection
                source="local"
                branches={branches}
                selectedBranch={branchSource === "local" ? branch : null}
                search={search}
                open={open}
                query={query}
                disabled={isWorkspaceBusy}
                onSelect={selectBranch}
              />
              <View className="h-px shrink-0 bg-border" />
              {repositoryId ? (
                <ProjectBranchSection
                  source="remote"
                  branches={remoteBranches}
                  selectedBranch={branchSource === "remote" ? branch : null}
                  search={search}
                  open={open}
                  query={remoteQuery}
                  disabled={isWorkspaceBusy}
                  onSelect={(name) => selectBranch(name, "remote")}
                />
              ) : (
                <View className="gap-3 px-5 py-4">
                  <View className="flex-row items-center gap-2">
                    <Icon
                      family="Feather"
                      name="cloud"
                      size={18}
                      className="text-muted-foreground"
                      accessible={false}
                    />
                    <PText
                      accessibilityRole="header"
                      className="text-base font-medium"
                    >
                      Remote branches
                    </PText>
                  </View>
                  <PText className="text-base text-muted-foreground">
                    {projectQuery.isPending
                      ? "Loading repository…"
                      : projectQuery.error
                        ? "Unable to load the project’s repository."
                        : "No GitHub repository connected."}
                  </PText>
                  {projectQuery.error && (
                    <Button
                      variant="outline"
                      onPress={() => {
                        void projectQuery.refetch();
                      }}
                    >
                      Try again
                    </Button>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </ContentSheet>
    </>
  );
};
