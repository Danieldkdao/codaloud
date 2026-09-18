// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readProjectAction } from "@/features/projects/actions/actions";
import { useProject } from "@/features/projects/hooks/use-project";
import type { ProjectResponseData } from "@/features/projects/types";
import { createQueryClient } from "@/lib/query-client";
vi.mock("@/features/projects/actions/actions", () => ({ readProjectAction: vi.fn() }));

const read = vi.mocked(readProjectAction);
const project: ProjectResponseData = {
  id: "project-one", name: "My project",
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
  read.mockReset().mockResolvedValue(project);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.useRealTimers();
});

describe("useProject", () => {
  it.each(["ready", "failed"] as const)("refreshes queued and running setup, then stops at %s", async (setupStatus) => {
    vi.useFakeTimers();
    read.mockResolvedValueOnce(project)
      .mockResolvedValueOnce({ ...project, setupStatus: "running" })
      .mockResolvedValue({ ...project, setupStatus });

    await act(async () => {
      root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { projectId: project.id })));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(current.data?.setupStatus).toBe("pending");
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(current.data?.setupStatus).toBe("running");
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(current.data?.setupStatus).toBe(setupStatus);
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("returns the query result and caches by project", async () => {
    await render();
    expect(current.isSuccess).toBe(true);
    expect(current.data).toEqual(project);
    expect(read).toHaveBeenCalledWith(project.id, expect.any(AbortSignal));
    expect(client.getQueryData(["projects", "detail", project.id])).toEqual(project);
  });

  it("works locally without an account or session", async () => { await render(); expect(read).toHaveBeenCalledOnce(); });

  it("isolates project changes without requiring an account", async () => {
    await render();
    const secondProject = { ...project, id: "project-two" };
    read.mockResolvedValueOnce(secondProject);
    await render(secondProject.id);
    expect(current.data).toEqual(secondProject);
    expect(client.getQueryData(["projects", "detail", project.id])).toEqual(project);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("fails once on a statusless read failure and supports a manual retry", async () => {
    read.mockResolvedValue(null);
    await render();
    await act(async () => {
      await vi.waitFor(() => {
        expect(client.getQueryState(["projects", "detail", project.id])?.status).toBe("error");
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
