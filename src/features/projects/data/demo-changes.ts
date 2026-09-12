import type { ProjectChangeData } from "@/features/projects/types";

// Visual fixtures only; these are never read from or written to the sandbox.
export const demoChanges: ProjectChangeData[] = [
  { path: "src/app/projects/[projectId]/git.tsx", status: "modified", additions: 38, deletions: 12 },
  { path: "src/features/projects/components/project-commit-list.tsx", status: "modified", additions: 16, deletions: 8 },
  { path: "src/features/projects/components/git-placeholder.tsx", status: "deleted", additions: 0, deletions: 24 },
  { path: "src/features/projects/components/project-git-tabs.tsx", status: "untracked", additions: 86, deletions: 0 },
  { path: "src/features/projects/components/project-changes-panel.tsx", status: "untracked", additions: 124, deletions: 0 },
];
