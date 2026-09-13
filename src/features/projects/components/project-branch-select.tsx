import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useProjectBranches } from "@/features/projects/hooks/use-project-branches";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import type { ProjectBranchPageSchema } from "@/features/projects/actions/branch-schemas";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";
import { useThemeColor } from "@/hooks/use-theme";

import { ProjectBranchSection } from "./project-branch-section";
import { ContentSheet } from "@/components/ui/content-sheet";
import { useProject } from "../hooks/use-project";
import { useGitHubRepositoryBranches } from "@/services/github/hooks/use-github-repository-branches";
import type { GitHubRepositoryBranchPage, GitHubRepositoryBranch } from "@/services/github/types";
import { formatProjectBranchLabel } from "../lib/formatters";

const getRemoteBranches = (page: GitHubRepositoryBranchPage) => page.branches;
const getRemoteBranchKey = (branch: GitHubRepositoryBranch) => branch.name;

const getBranches = (page: ProjectBranchPageSchema) => page.branches;
const getBranchKey = (branch: string) => branch;

export const ProjectBranchSelect = () => {
  const { width } = useWindowDimensions();
  const { projectId, branch, branchSource, setBranch, isBranchLoading, setIsBranchLoading } = useProjectWorkspaceBranch();
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
  const [open, setOpen] = useState(false);
  const card = useThemeColor("card");
  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Branch: ${formatProjectBranchLabel(branch, isBranchLoading)}`}
        accessibilityHint="Opens available branches"
        accessibilityState={{ expanded: open }}
        className="size-12 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon family="Feather" name="git-branch" size={22} className="text-foreground" accessible={false} />
      </Pressable>
      <ContentSheet open={open} onOpenChange={setOpen} backgroundColor={card}>
        {/* Native content fitting measures both axes; constrain width while leaving height intrinsic. */}
        <View style={{ width }}>
          <View className="bg-card" accessibilityViewIsModal onAccessibilityEscape={close}>
            <View>
              <ProjectBranchSection source="local" branches={branches} selectedBranch={branchSource === "local" ? branch : null}
                search={search} open={open} query={query} onSelect={(name) => { close(); setBranch(name, "local"); }} />
              <View className="h-px shrink-0 bg-border" />
              {repositoryId ? (
                <ProjectBranchSection source="remote" branches={remoteBranches.map(({ name }) => name)} selectedBranch={branchSource === "remote" ? branch : null}
                  search={search} open={open} query={remoteQuery} onSelect={(name) => { close(); setBranch(name, "remote"); }} />
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
            <View className="flex-row items-center gap-2 border-t border-border px-5 py-1">
              <Icon family="Feather" name="search" size={20} className="text-muted-foreground" accessible={false} />
              <Input type="search" variant="ghost" size="sm" placeholder="Search branches"
                accessibilityLabel="Search branches" autoCapitalize="none" autoCorrect={false}
                value={search} onChangeText={setSearch} maxLength={200}
                containerClassName="min-w-0 flex-1" className="border-0 px-0 py-1 focus:border-transparent focus:outline-0" />
            </View>
          </View>
        </View>
      </ContentSheet>
    </>
  );
};
