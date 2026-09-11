// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { UpdateProjectForm } from "@/features/projects/components/update-project-form";

const mocks = vi.hoisted(() => ({ update: vi.fn(), back: vi.fn(), alert: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/use-success-feedback", () => ({ useSuccessFeedback: () => mocks.success }));
vi.mock("@/features/projects/actions/actions", () => ({ updateProjectAction: mocks.update }));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: mocks.back }) }));
vi.mock("@/lib/utils", () => ({ alert: mocks.alert }));
vi.mock("@/components/app-wrapper", () => ({ AppWrapper: ({ children }: { children: ReactNode }) => children }));
vi.mock("react-native", () => {
  const View = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return { View, ScrollView: View };
});
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children?: ReactNode }) => createElement("span", null, children) }));
vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChangeText, onSubmitEditing, editable }: {
    value: string; onChangeText: (value: string) => void; onSubmitEditing: () => void; editable?: boolean;
  }) => createElement("input", {
    value, readOnly: editable === false,
    onInput: (event) => onChangeText(event.currentTarget.value),
    onKeyDown: (event) => { if (event.key === "Enter") onSubmitEditing(); },
  }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled, loading }: {
    children?: ReactNode; onPress: () => void; disabled?: boolean; loading?: boolean;
  }) => createElement("button", { onClick: onPress, disabled, "aria-busy": loading }, children),
}));

const projectId = "project-one";
const listKey = ["projects", "infinite", "cursor", "user-one", {}];
const detailKey = ["projects", "detail", "user-one", projectId];
const filteredKey = ["projects", "infinite", "cursor", "user-one", { search: "old" }];
const unrelatedKey = ["github", "repositories"];
let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
let unsubscribes: (() => void)[];
const loadList = vi.fn();
const loadDetail = vi.fn();
const render = async (name = "Old name") => {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(UpdateProjectForm, { projectId, defaultValues: { name } }))));
};
const submit = async () => { await act(async () => container.querySelector("button")!.click()); };
const rename = async (name: string) => {
  await act(async () => {
    const input = container.querySelector("input")!;
    input.value = name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const key of [listKey, detailKey, filteredKey, unrelatedKey]) client.setQueryData(key, { name: "Old name" });
  loadList.mockReset().mockResolvedValue({ name: "New name" });
  loadDetail.mockReset().mockResolvedValue({ name: "New name" });
  unsubscribes = [
    new QueryObserver(client, { queryKey: listKey, queryFn: loadList }).subscribe(() => {}),
    new QueryObserver(client, { queryKey: detailKey, queryFn: loadDetail }).subscribe(() => {}),
  ];
  mocks.update.mockReset().mockResolvedValue({ error: false, message: "Updated", projectId });
  container = document.createElement("div");
  root = createRoot(container);
  await render();
});
afterEach(() => {
  act(() => root.unmount());
  unsubscribes.forEach((unsubscribe) => unsubscribe());
  client.clear();
});

it("enables saving only while the form differs from its initial values", async () => {
  expect(container.querySelector("button")!.disabled).toBe(true);
  await submit();
  expect(mocks.update).not.toHaveBeenCalled();
  await rename("New name");
  expect(container.querySelector("button")!.disabled).toBe(false);
  await rename("Old name");
  expect(container.querySelector("button")!.disabled).toBe(true);
  await submit();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("ignores keyboard submission when the form has no changes", async () => {
  await act(async () => {
    container.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.back).not.toHaveBeenCalled();
});

it("submits the edited name, refreshes project views and closes the sheet", async () => {
  await rename(" New name ");
  await submit();
  expect(mocks.update).toHaveBeenCalledWith(projectId, { name: "New name" });
  expect(loadList).toHaveBeenCalledOnce();
  expect(loadDetail).toHaveBeenCalledOnce();
  expect(client.getQueryData(listKey)).toEqual({ name: "New name" });
  expect(client.getQueryState(filteredKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  expect(mocks.back).toHaveBeenCalledOnce();
  expect(mocks.alert).not.toHaveBeenCalled();
  expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Changes saved");
});

it("shows validation errors without calling the action", async () => {
  await rename(" ");
  await submit();
  expect(container.textContent).toContain("Project name is required.");
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.back).not.toHaveBeenCalled();
});

it("keeps the draft and cache on failure, alerts, and allows retry", async () => {
  mocks.update.mockResolvedValueOnce({ error: true, message: "Update failed" });
  await rename("New name");
  await submit();
  expect(mocks.alert).toHaveBeenCalledWith("Error: Update failed");
  expect(mocks.success).not.toHaveBeenCalled();
  expect(container.querySelector("input")!.value).toBe("New name");
  expect(container.querySelector("button")!.disabled).toBe(false);
  expect(loadList).not.toHaveBeenCalled();
  expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
  expect(mocks.back).not.toHaveBeenCalled();
  await submit();
  expect(mocks.back).toHaveBeenCalledOnce();
  expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Changes saved");
});

it("waits for saving and prevents duplicate button and keyboard submissions", async () => {
  let resolve!: (result: { error: false; message: string; projectId: string }) => void;
  mocks.update.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await rename("New name");
  await act(async () => {
    container.querySelector("button")!.click();
    container.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(container.querySelector("button")!.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector("input")!.readOnly).toBe(true);
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.back).not.toHaveBeenCalled();
  await act(async () => resolve({ error: false, message: "Updated", projectId }));
  expect(mocks.back).toHaveBeenCalledOnce();
  expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Changes saved");
});

it("closes after saving even while refreshing the list is pending", async () => {
  loadList.mockImplementation(() => new Promise(() => {}));
  await rename("New name");
  await submit();
  expect(loadList).toHaveBeenCalledOnce();
  expect(mocks.back).toHaveBeenCalledOnce();
});

it("does not navigate again if the sheet was dismissed during saving", async () => {
  let resolve!: (result: { error: false; message: string; projectId: string }) => void;
  mocks.update.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await rename("New name");
  await submit();
  await act(async () => root.render(null));
  await act(async () => resolve({ error: false, message: "Updated", projectId }));
  expect(loadList).toHaveBeenCalledOnce();
  expect(mocks.back).not.toHaveBeenCalled();
  expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Changes saved");
});
