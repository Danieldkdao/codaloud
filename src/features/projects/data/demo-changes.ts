import type { ProjectWorkspaceDiffFile } from "@/features/projects/types";

// Visual fixtures only; these are never read from or written to the sandbox.
const demoDiffFiles: Omit<ProjectWorkspaceDiffFile, "additions" | "deletions">[] = [
  {
    path: "src/app/projects/[projectId]/git/index.tsx",
    status: "modified",
    patch: `   return (
-    <GitPlaceholder />
+    <View className="flex-1">
+      <ProjectGitTabs />
+      <ProjectChangesPanel changes={changes} />
+    </View>
   );
 };`,
  },
  {
    path: "src/features/projects/components/project-commit-list.tsx",
    status: "modified",
    patch: `-  const commits = demoCommits;
+  const { data, isPending } = useProjectCommits();
+  const commits = data ?? [];
+  if (isPending) return <LoadingState />;
${" "}
   return <CommitList commits={commits} />;
 };`,
  },
  {
    path: "src/features/projects/components/git-placeholder.tsx",
    status: "deleted",
    patch: `-export const GitPlaceholder = () => (
-  <View>
-    <PText>Your changes will appear here.</PText>
-  </View>
-);`,
  },
  {
    path: "src/features/projects/components/project-git-tabs.tsx",
    status: "untracked",
    patch: `+export const ProjectGitTabs = () => (
+  <View className="flex-row">
+    <Tab label="Changes" />
+    <Tab label="History" />
+  </View>
+);`,
  },
  {
    path: "src/features/projects/components/project-changes-panel.tsx",
    status: "untracked",
    patch: `+export const ProjectChangesPanel = ({ changes }) => (
+  <ScrollView>
+    {changes.map((change) => (
+      <ChangeRow key={change.path} change={change} />
+    ))}
+  </ScrollView>
+);`,
  },
];

// Keep the list and workspace totals aligned with the displayed mock hunks.
export const demoChanges: ProjectWorkspaceDiffFile[] = demoDiffFiles.map((file) => ({
  ...file,
  additions: file.patch.split("\n").filter((line) => line.startsWith("+")).length,
  deletions: file.patch.split("\n").filter((line) => line.startsWith("-")).length,
}));
