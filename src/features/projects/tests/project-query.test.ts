// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readProjectAction } from "@/features/projects/actions/actions";
import { useProject } from "@/features/projects/hooks/use-project";
import type { ProjectResponseData } from "@/features/projects/types";
import { createQueryClient } from "@/lib/query-client";

const session = vi.hoisted(() => ({
  data: { user: { id: "user-one" } } as { user: { id: string } } | null,
  isPending: false,
  error: null as Error | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));
vi.mock("@/features/projects/actions/actions", () => ({ readProjectAction: vi.fn() }));

const read = vi.mocked(readProjectAction);
const project: ProjectResponseData = {
  id: "project-one", userId: "user-one", name: "My project", sandboxId: null,
  setupStatus: "pending", setupError: null, githubRepositoryId: null,
  lastOpenedFilePath: null, lastOpenedAt: null,
  createdAt: "2026-09-07T12:00:00.000Z", updatedAt: "2026-09-07T12:00:00.000Z",
};
let client: QueryClient;
let root: Root;
let current: ReturnType<typeof useProject>;
const Probe = ({ projectId }: { projectId: string }) => {
  current = { ...useProject(projectId) };
  return null;
};
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};
const render = async (projectId = project.id) => {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { projectId })));
  });
  await flush();
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = createQueryClient();
  // Keep the production retry policy; shorten only the delay for these tests.
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  root = createRoot(document.createElement("div"));
  session.data = { user: { id: "user-one" } };
  session.isPending = false;
  session.error = null;
  read.mockReset().mockResolvedValue(project);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("useProject", () => {
  it("returns the query result and caches by user and project", async () => {
    await render();
    expect(current.isSuccess).toBe(true);
    expect(current.data).toEqual(project);
    expect(read).toHaveBeenCalledWith(project.id, expect.any(AbortSignal));
    expect(client.getQueryData(["projects", "detail", "user-one", project.id])).toEqual(project);
  });

  it.each(["pending", "signed-out", "error"])("does not fetch when authentication is %s, even on manual refetch", async (state) => {
    if (state === "pending") session.isPending = true;
    if (state === "signed-out") session.data = null;
    if (state === "error") session.error = new Error("Session unavailable");
    await render();
    expect(current.fetchStatus).toBe("idle");
    expect(read).not.toHaveBeenCalled();
    await act(async () => { await current.refetch(); });
    expect(read).not.toHaveBeenCalled();
  });

  it("loads when authentication resolves and isolates project and account changes", async () => {
    session.isPending = true;
    await render();
    session.isPending = false;
    await render();
    const secondProject = { ...project, id: "project-two" };
    read.mockResolvedValueOnce(secondProject);
    await render(secondProject.id);
    expect(current.data).toEqual(secondProject);
    const otherUserProject = { ...project, userId: "user-two" };
    session.data = { user: { id: "user-two" } };
    read.mockResolvedValueOnce(otherUserProject);
    await render();
    expect(current.data).toEqual(otherUserProject);
    expect(client.getQueryData(["projects", "detail", "user-one", project.id])).toEqual(project);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("fails once on a statusless read failure and supports a manual retry", async () => {
    read.mockResolvedValue(null);
    await render();
    await act(async () => {
      await vi.waitFor(() => {
        expect(client.getQueryState(["projects", "detail", "user-one", project.id])?.status).toBe("error");
      });
    });
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    expect(current.isError).toBe(true);
    expect(current.isFetching).toBe(false);
    expect(current.error?.message).toBe("Unable to load project. Please try again.");
    read.mockResolvedValue(project);
    await act(async () => { await current.refetch(); });
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(current.data).toEqual(project);
    expect(current.isSuccess).toBe(true);
  });

  it("forwards query cancellation to the read action", async () => {
    let requestSignal: AbortSignal | undefined;
    read.mockImplementation((_id, signal) => new Promise((resolve) => {
      requestSignal = signal;
      signal?.addEventListener("abort", () => resolve(null), { once: true });
    }));
    await render();
    expect(requestSignal?.aborted).toBe(false);
    await act(async () => { await client.cancelQueries({ queryKey: ["projects"] }); });
    await flush();
    expect(requestSignal?.aborted).toBe(true);
    expect(current.error).toBeNull();
  });
});
