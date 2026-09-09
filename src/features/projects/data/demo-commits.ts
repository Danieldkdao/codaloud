import type { ProjectBranchData, ProjectCommitData } from "@/features/projects/types";

// Illustrative history for the mock Next.js project, newest first.
const demoCommits: ProjectCommitData[] = [
  {
    hash: "a7e3c91b42d8f6019a8c7b6d5e4f3210a9b8c7d6",
    message: "Polish the dashboard layout",
    author: "Alex Morgan",
    committedAt: "2026-09-09T12:15:00Z",
    refs: ["HEAD", "main"],
  },
  {
    hash: "bf82d047a6c913e5d4b8f1027a6e3c9d8b5f4120",
    message: "Merge branch 'feat/project-cards'",
    author: "Alex Morgan",
    committedAt: "2026-09-09T10:40:00Z",
    isMerge: true,
  },
  {
    hash: "c14a8e2907b6d53f4a1c9e8d0b7f6235a4e1d890",
    message: "Add project cards and empty states",
    author: "Sam Chen",
    committedAt: "2026-09-08T21:30:00Z",
    refs: ["feat/project-cards"],
  },
  {
    hash: "d903b6f18e2a547c9d0f31b8a6e4c5270d9b1f83",
    message: "Improve keyboard navigation",
    author: "Sam Chen",
    committedAt: "2026-09-08T18:20:00Z",
  },
  {
    hash: "e6a1d482bc903f751a4e8d620c3b9f17a5d2e406",
    message: "Create shared button and input components",
    author: "Alex Morgan",
    committedAt: "2026-09-08T15:10:00Z",
    refs: ["v0.1.0"],
  },
  {
    hash: "f2c9083a4d6b1e75c8a0d492e3f617b5c9d4a802",
    message: "Add loading and error boundaries",
    author: "Sam Chen",
    committedAt: "2026-09-07T20:45:00Z",
  },
  {
    hash: "19b4a8d6e3c052f7a9b1d840c6e2357f4a8d9b02",
    message: "Set up app routes and shared layout",
    author: "Alex Morgan",
    committedAt: "2026-09-07T16:30:00Z",
  },
  {
    hash: "28d7c301a9e6b4f852c1d0937a5e6f4b8c2d0193",
    message: "Configure TypeScript and ESLint",
    author: "Alex Morgan",
    committedAt: "2026-09-06T17:00:00Z",
  },
  {
    hash: "3a5e901d7c8b2f406a9d13e5b7c4f8210d6a9e32",
    message: "Initial commit",
    author: "Alex Morgan",
    committedAt: "2026-09-06T14:00:00Z",
  },
];


// These lists share the same ancestor commits. Selecting a branch reviews its
// history; it does not move HEAD away from the checked-out main branch.
export const demoBranches: ProjectBranchData[] = [
  { name: "main", commits: demoCommits },
  { name: "feat/project-cards", commits: demoCommits.slice(2) },
  {
    name: "fix/keyboard-navigation",
    commits: [
      {
        hash: "4c8d2a107e93b5f604d18a2c9f0b7e635a4d8291",
        message: "Restore focus after closing dialogs",
        author: "Sam Chen",
        committedAt: "2026-09-09T11:10:00Z",
        refs: ["fix/keyboard-navigation"],
      },
      {
        hash: "5e2b7f901c4a6d830b9e12f7a0c5d6483e9b210a",
        message: "Keep tab navigation inside the active panel",
        author: "Sam Chen",
        committedAt: "2026-09-09T10:20:00Z",
      },
      ...demoCommits.slice(3),
    ],
  },
];
