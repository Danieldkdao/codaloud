import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import { gitCreateBranchSchema } from "../server/git-branch-schemas";
import { useProjectBranches } from "../hooks/use-project-branches";
import { useProjectGitOperation } from "../hooks/use-project-git-operation";

export const ProjectBranchCreate = ({ name, exists, onCreated }: {
  name: string;
  exists: boolean;
  onCreated: () => void;
}) => {
  const operation = useProjectGitOperation();
  const { gitCreateBranch } = useProjectBranches(operation.projectId, { enabled: false });
  const input = gitCreateBranchSchema.safeParse({ branchName: name });
  if (!name) return null;
  const disabled = !input.success || exists || operation.isWorkspaceBusy || !operation.branch;
  const create = async () => {
    if (disabled || !input.success) return;
    const result = await operation.run("Creating branch…", async () => {
      const created = await gitCreateBranch.mutateAsync(input.data);
      operation.assertWorkspaceCurrent();
      operation.setBranch(created.currentBranch);
      return created;
    }, { changesFiles: true, success: () => "Branch created and checked out." });
    if (result) onCreated();
  };
  return (
    <View className="gap-2 border-b border-border px-5 py-3">
      <PText className="text-base text-muted-foreground">
        {exists ? "This local branch already exists." : !input.success ? input.error.issues[0]?.message : "Create and switch to a new branch from the current branch."}
      </PText>
      <Button accessibilityLabel="Create branch" disabled={disabled} loading={operation.workspaceOperation === "Creating branch…"} onPress={() => void create()}>
        Create branch
      </Button>
    </View>
  );
};
