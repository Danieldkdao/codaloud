import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import type { CommitSource } from "../actions/commit-schemas";
import {
  formatCommitHash,
  formatCommitTimestamp,
  formatProjectChangeCount,
} from "../lib/formatters";
import { createProjectWorkspaceDiff } from "../lib/workspace-diff";
import { ProjectDiffList } from "./project-diff-list";
import { ProjectWorkspaceDiffSummary } from "./project-workspace-diff-summary";

type ProjectCommitDiffProps = {
  commitSha: string;
  source: CommitSource;
};

// Temporary presentation data while the commit screen is built independently of its API read.
const commitPreview = {
  subject: "improve workspace startup feedback",
  author: "Alex Morgan",
  authorEmail: "alex@example.com",
  committedAt: "2026-09-14T14:32:00Z",
  parentSha: "8f2c9d1a6b340e5f72819c0d6a4e3b9f12c08567",
};

const commitDiffPreview = createProjectWorkspaceDiff({
  repositoryState: "ready",
  currentBranch: null,
  headSha: null,
  isDetached: false,
  observedAt: commitPreview.committedAt,
  changes: [
    {
      path: "src/features/projects/components/project-setup-status.tsx",
      originalPath: null,
      indexStatus: "modified",
      worktreeStatus: "unchanged",
      isUntracked: false,
      isConflicted: false,
      kind: "file",
      headMode: "100644",
      indexMode: "100644",
      worktreeMode: "100644",
      unstaged: null,
      staged: {
        patch:
          '@@ -1,5 +1,7 @@\n export const ProjectSetupStatus = ({ ready }) => {\n-  const message = "Loading project…";\n+  const message = ready\n+    ? "Your workspace is ready to go"\n+    : "We’re starting your workspace";\n \n   return <PText>{message}</PText>;\n };\n',
        additions: 3,
        deletions: 1,
        unavailableReason: null,
      },
    },
    {
      path: "src/features/projects/lib/workspace-messages.ts",
      originalPath: null,
      indexStatus: "added",
      worktreeStatus: "unchanged",
      isUntracked: false,
      isConflicted: false,
      kind: "file",
      headMode: "000000",
      indexMode: "100644",
      worktreeMode: "100644",
      unstaged: null,
      staged: {
        patch:
          '@@ -0,0 +1,4 @@\n+export const formatWorkspaceLoadingMessage = (restoring: boolean) =>\n+  restoring\n+    ? "We’re restoring your workspace"\n+    : "We’re starting your workspace";\n',
        additions: 4,
        deletions: 0,
        unavailableReason: null,
      },
    },
  ],
});

export const ProjectCommitDiff = ({ commitSha }: ProjectCommitDiffProps) => (
  <ProjectDiffList
    accessibilityLabel="Commit diff"
    files={commitDiffPreview.files}
    header={
      <View className="gap-5 px-4 pt-4 pb-5">
        <HeadingText selectable accessibilityRole="header" className="text-3xl">
          {commitPreview.subject}
        </HeadingText>

        <View className="gap-3 rounded-xl border border-border bg-card/40 p-4">
          <View className="flex-row items-center gap-3">
            <View className="size-11 items-center justify-center rounded-full bg-secondary">
              <Icon
                family="Feather"
                name="user"
                size={20}
                className="text-muted-foreground"
                accessible={false}
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <PText selectable className="text-base font-semibold">
                {commitPreview.author}
              </PText>
              <PText selectable className="text-base text-muted-foreground">
                {commitPreview.authorEmail}
              </PText>
            </View>
          </View>
          <PText selectable className="text-base text-muted-foreground">
            Committed {formatCommitTimestamp(commitPreview.committedAt)}
          </PText>
          <View className="flex-row flex-wrap items-center gap-2">
            <PText className="text-base text-muted-foreground">Parent</PText>
            <CodeText selectable className="text-base text-muted-foreground">
              {formatCommitHash(commitPreview.parentSha)}
            </CodeText>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <Button variant="outline" accessibilityLabel="Copy commit SHA">
            <Icon
              family="Feather"
              name="copy"
              size={18}
              className="text-foreground"
              accessible={false}
            />
            Copy SHA
          </Button>
          <Button variant="outline" accessibilityLabel="View commit on GitHub">
            <Icon
              family="Feather"
              name="github"
              size={18}
              className="text-foreground"
              accessible={false}
            />
            View on GitHub
          </Button>
        </View>

        <View className="flex-row flex-wrap items-center justify-between gap-3 pt-1">
          <PText className="text-base font-semibold">
            {formatProjectChangeCount(commitDiffPreview.summary.fileCount)}{" "}
            changed
          </PText>
          <ProjectWorkspaceDiffSummary summary={commitDiffPreview.summary} />
        </View>
      </View>
    }
  />
);
