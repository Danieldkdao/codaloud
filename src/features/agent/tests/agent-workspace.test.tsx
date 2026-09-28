// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  saved: vi.fn(),
  rename: vi.fn(),
  reset: vi.fn(),
  refresh: vi.fn(),
  branch: vi.fn(),
  invalidate: vi.fn(),
  renameTabs: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    isMutating: () => 0,
    resetQueries: mocks.reset,
    invalidateQueries: mocks.invalidate,
  }),
}));
vi.mock("@/features/projects/hooks/use-project-workspace-branch", () => ({
  useProjectWorkspaceBranch: () => ({
    projectId: "project",
    runWorkspaceOperation: mocks.lock,
    setBranch: mocks.branch,
  }),
}));
vi.mock("@/features/projects/hooks/use-project-file-save", () => ({
  useProjectFileSaveRegistry: () => ({
    withSavedFiles: mocks.saved,
    renameFiles: mocks.rename,
  }),
}));
vi.mock("@/features/projects/hooks/use-project-workspace-current-file", () => ({
  useProjectWorkspaceCurrentFile: () => ({
    refreshFiles: mocks.refresh,
    renameFiles: mocks.renameTabs,
  }),
}));
vi.mock("@/features/projects/actions/git-actions", () => ({
  readProjectGitCountsAction: async () => ({ currentBranch: "feature" }),
}));
import { AgentWorkspaceBridge } from "../hooks/use-agent-workspace";
import { runAgentMutation } from "../workspace-access";
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.lock.mockImplementation(async (_label, action) => action(() => {}));
  mocks.saved.mockImplementation(async (action) => action());
  mocks.rename.mockImplementation(async (_old, _next, action) => action());
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(AgentWorkspaceBridge)));
});
afterEach(() => act(() => root.unmount()));
it("refreshes confirmed files even after a partially failing mutation", async () => {
  const action = vi.fn(async () => {
    throw new Error("Merge conflict");
  });
  await expect(runAgentMutation("project", action)).rejects.toThrow(
    "Merge conflict",
  );
  expect(mocks.saved).toHaveBeenCalledOnce();
  expect(mocks.reset).toHaveBeenCalledWith({
    queryKey: ["projects", "file", "project"],
  });
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.branch).toHaveBeenCalledWith("feature");
});
it("moves retained drafts through the existing rename registry before updating tabs", async () => {
  const action = vi.fn(async () => "renamed");
  await runAgentMutation("project", action, {
    id: "step",
    name: "renameFile",
    args: {
      parentPath: "src",
      previousName: "a.ts",
      name: "b.ts",
      kind: "file",
    },
    revision: "a".repeat(64),
    tokenId: "token",
  });
  expect(mocks.saved).not.toHaveBeenCalled();
  expect(mocks.rename).toHaveBeenCalledWith("src/a.ts", "src/b.ts", action);
  expect(mocks.renameTabs).toHaveBeenCalledWith("src/a.ts", "src/b.ts");
  expect(action).toHaveBeenCalledOnce();
});
