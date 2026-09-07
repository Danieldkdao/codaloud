// @vitest-environment happy-dom
import { act, cloneElement, createElement, useImperativeHandle, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ProjectsListItem } from "@/features/projects/components/projects-list-item";
import type { ProjectResponseData } from "@/features/projects/types";
import type { PressableProps, ViewProps } from "react-native";
import type { SwipeableProps } from "react-native-gesture-handler/ReanimatedSwipeable";
import type { ConfirmActionOptions } from "@/lib/types";

const mocks = vi.hoisted(() => ({ remove: vi.fn(), confirm: vi.fn(), alert: vi.fn(), push: vi.fn(), close: vi.fn(), swipe: {} as SwipeableProps, card: {} as PressableProps }));
vi.mock("@/features/projects/actions/actions", () => ({ deleteProjectAction: mocks.remove }));
vi.mock("@/lib/utils", () => ({ cn: () => "", confirmAction: mocks.confirm, alert: mocks.alert }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  Link: Object.assign(
    ({ children, href }: { children: ReactElement<PressableProps> | ReactElement<PressableProps>[]; href: unknown }) => {
      const elements = Array.isArray(children) ? children : [children];
      return createElement("div", null, cloneElement(elements[0], { onPress: () => mocks.push(href) }), ...elements.slice(1));
    },
    {
      Trigger: ({ children, onPress }: { children: ReactElement<PressableProps>; onPress?: PressableProps["onPress"] }) => cloneElement(children, { onPress }),
      Menu: ({ children }: { children?: ReactNode }) => children,
      MenuAction: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => createElement("button", { onClick: onPress }, children),
    },
  ),
}));
// Exercise the row's action wiring; native gesture recognition is owned by RNGH.
vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  default: (props: SwipeableProps) => {
    mocks.swipe = props;
    useImperativeHandle(props.ref, () => ({ close: mocks.close, openLeft: vi.fn(), openRight: vi.fn(), reset: vi.fn() }));
    return createElement("div", null, props.children,
      props.renderRightActions?.({ value: 1 } as never, { value: -200 } as never, { close: mocks.close } as never));
  },
}));
vi.mock("react-native", () => {
  const Wrapper = ({ children, accessibilityLabel, accessibilityRole, accessibilityState, pointerEvents }: ViewProps) =>
    createElement("div", { "aria-label": accessibilityLabel, role: accessibilityRole, "aria-busy": accessibilityState?.busy, "data-pointer-events": pointerEvents }, children);
  return {
    View: Wrapper,
    ActivityIndicator: () => createElement("progress"),
    Pressable: (props: PressableProps) => {
      mocks.card = props;
      return createElement("button", { onClick: () => props.onPress?.({} as never), "data-project-card": true, disabled: props.disabled }, props.children as ReactNode);
    },
  };
});
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, accessibilityLabel, disabled }: { children?: ReactNode; onPress?: () => void; accessibilityLabel?: string; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled }, children),
}));
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
  container.querySelector<HTMLButtonElement>('[aria-label="Delete My project"]')!.click();
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


it("reveals Update and Delete without navigating or deleting on swipe", () => {
  expect(container.querySelector('[aria-label="Update My project"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Delete My project"]')).not.toBeNull();
  act(() => {
    mocks.swipe.onSwipeableWillOpen?.("left" as never);
    mocks.swipe.onSwipeableOpen?.("left" as never);
  });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("closes the row and opens the selected project's update form", () => {
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Update My project"]')!.click());
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ pathname: "/edit-project", params: { projectId: project.id } });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("still opens a project when its card is tapped", () => {
  act(() => container.querySelector<HTMLButtonElement>("[data-project-card]")!.click());
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ pathname: "/projects/[projectId]", params: { projectId: project.id } });
});

it("closes the row on Delete and leaves the project intact if confirmation is dismissed", () => {
  openConfirmation();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(client.getQueryData(listKey)).toEqual([project]);
});

it("offers Update and Delete to screen readers without requiring a swipe", () => {
  expect(mocks.card.accessibilityActions).toEqual(expect.arrayContaining([
    { name: "update", label: "Update project" },
    { name: "delete", label: "Delete project" },
  ]));
  act(() => mocks.card.onAccessibilityAction?.({ nativeEvent: { actionName: "update" } } as never));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ pathname: "/edit-project", params: { projectId: project.id } });
  act(() => mocks.card.onAccessibilityAction?.({ nativeEvent: { actionName: "delete" } } as never));
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.remove).not.toHaveBeenCalled();
});


it("blocks the whole card only after confirmation and stays busy through the list refresh", async () => {
  let resolveDeletion!: (value: { error: false; message: string; projectId: string }) => void;
  let resolveRefresh!: (value: never[]) => void;
  mocks.remove.mockImplementation(() => new Promise((resolve) => { resolveDeletion = resolve; }));
  loadList.mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve; }));
  const staleAccessibilityAction = mocks.card.onAccessibilityAction;
  openConfirmation();
  expect(container.querySelector("progress")).toBeNull();
  expect(mocks.card.disabled).not.toBe(true);

  const options = mocks.confirm.mock.calls[0][2] as ConfirmActionOptions;
  let pending: ReturnType<ConfirmActionOptions["onConfirmPress"]>;
  act(() => { pending = options.onConfirmPress(); });
  expect(container.querySelector('[aria-label="Deleting My project"]')?.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector("progress")).not.toBeNull();
  expect(container.textContent).toContain(project.name);
  expect(container.querySelector('[data-pointer-events="none"]')).not.toBeNull();
  expect(mocks.swipe.enabled).toBe(false);
  expect(mocks.card.disabled).toBe(true);
  expect(mocks.card.accessibilityState).toMatchObject({ disabled: true, busy: true });
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Update My project"]')!.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Delete My project"]')!.disabled).toBe(true);
  act(() => {
    container.querySelector<HTMLButtonElement>("[data-project-card]")!.click();
    container.querySelector<HTMLButtonElement>('[aria-label="Update My project"]')!.click();
    container.querySelector<HTMLButtonElement>('[aria-label="Delete My project"]')!.click();
    staleAccessibilityAction?.({ nativeEvent: { actionName: "update" } } as never);
    staleAccessibilityAction?.({ nativeEvent: { actionName: "delete" } } as never);
    void options.onConfirmPress();
  });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.remove).toHaveBeenCalledOnce();

  await act(async () => {
    resolveDeletion({ error: false, message: "Deleted", projectId: project.id });
  });
  expect(loadList).toHaveBeenCalledOnce();
  expect(container.querySelector("progress")).not.toBeNull();
  expect(mocks.card.disabled).toBe(true);
  await act(async () => { resolveRefresh([]); await pending; });
  expect(container.querySelector("progress")).toBeNull();
  expect(client.getQueryData(listKey)).toEqual([]);
});

it.each(["response", "exception"])("restores the card after a deletion %s failure", async (failure) => {
  if (failure === "response") mocks.remove.mockResolvedValueOnce({ error: true, message: "Deletion failed" });
  else mocks.remove.mockRejectedValueOnce(new Error("Connection failed"));
  openConfirmation();
  await confirm();
  expect(mocks.alert).toHaveBeenCalledOnce();
  expect(container.querySelector("progress")).toBeNull();
  expect(mocks.card.disabled).toBe(false);
  expect(mocks.swipe.enabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Delete My project"]')!.disabled).toBe(false);
  expect(client.getQueryData(listKey)).toEqual([project]);
  openConfirmation();
  await confirm();
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(loadList).toHaveBeenCalledOnce();
});
