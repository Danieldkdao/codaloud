// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ProjectsListItem } from "@/features/projects/components/projects-list-item";
import type { ProjectResponseData } from "@/features/projects/types";
import type { ConfirmActionOptions } from "@/lib/types";

const mocks = vi.hoisted(() => ({ remove: vi.fn(), confirm: vi.fn(), alert: vi.fn() }));
vi.mock("@/features/projects/actions/actions", () => ({ deleteProjectAction: mocks.remove }));
vi.mock("@/lib/utils", () => ({ cn: () => "", confirmAction: mocks.confirm, alert: mocks.alert }));
vi.mock("expo-router", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    useRouter: () => ({ push: vi.fn() }),
    Link: Object.assign(Wrapper, {
      Trigger: Wrapper, Menu: Wrapper,
      MenuAction: ({ children, onPress, disabled }: { children?: ReactNode; onPress?: () => void; disabled?: boolean }) =>
        createElement("button", { onClick: onPress, disabled }, children),
    }),
  };
});
vi.mock("react-native", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return { View: Wrapper, Pressable: Wrapper };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) => createElement("span", null, children);
  return { HeadingText: Text, PText: Text };
});

const project: ProjectResponseData = {
  id: "project-one", userId: "user-one", name: "My project", sandboxId: null,
  setupStatus: "pending", setupError: null, githubRepositoryId: null,
  lastOpenedFilePath: null, lastOpenedAt: null,
  createdAt: "2026-09-07T12:00:00.000Z", updatedAt: "2026-09-07T12:00:00.000Z",
};
const listKey = ["projects", "infinite", "cursor", project.userId, {}];
const detailKey = ["projects", "detail", project.userId, project.id];
const filteredKey = ["projects", "infinite", "cursor", project.userId, { search: "My" }];
let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
let unsubscribe: () => void;
const loadList = vi.fn();
const openConfirmation = () => act(() => {
  Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Delete project")!.click();
});
const confirm = async () => {
  const options = mocks.confirm.mock.calls[0][2] as ConfirmActionOptions;
  await act(async () => { await options.onConfirmPress(); });
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(listKey, [project]);
  client.setQueryData(detailKey, project);
  client.setQueryData(filteredKey, [project]);
  client.setQueryData(["github", "repositories"], []);
  loadList.mockReset().mockResolvedValue([]);
  unsubscribe = new QueryObserver(client, { queryKey: listKey, queryFn: loadList }).subscribe(() => {});
  mocks.remove.mockReset().mockResolvedValue({ error: false, message: "Deleted", projectId: project.id });
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(ProjectsListItem, { project }))));
});
afterEach(() => { act(() => root.unmount()); unsubscribe(); client.clear(); });

it("waits for explicit confirmation before deleting the selected project", async () => {
  openConfirmation();
  expect(mocks.confirm).toHaveBeenCalledWith("Delete project?", expect.stringContaining(project.name), expect.objectContaining({ actionText: "Delete", onConfirmPress: expect.any(Function) }));
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(loadList).not.toHaveBeenCalled();
  await confirm();
  expect(mocks.remove).toHaveBeenCalledWith(project.id);
  expect(loadList).toHaveBeenCalledOnce();
  expect(client.getQueryData(listKey)).toEqual([]);
  expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(filteredKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["github", "repositories"])?.isInvalidated).toBe(false);
  expect(mocks.alert).not.toHaveBeenCalled();
});

it("alerts on failure, preserves the cache, and allows another attempt", async () => {
  mocks.remove.mockResolvedValueOnce({ error: true, message: "Deletion failed" });
  openConfirmation();
  await confirm();
  expect(mocks.alert).toHaveBeenCalledWith("Error: Deletion failed");
  expect(loadList).not.toHaveBeenCalled();
  expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
  expect(client.getQueryData(listKey)).toEqual([project]);
  openConfirmation();
  await confirm();
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(loadList).toHaveBeenCalledOnce();
});
