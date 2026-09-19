// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GitIdentityForm } from "../components/git-identity-form";

const mocks = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn() }));
vi.mock("../git-identity", async (original) => ({
  ...await original<typeof import("../git-identity")>(),
  saveGitIdentity: mocks.save,
  readGitIdentity: mocks.read,
}));
vi.mock("expo-sqlite/kv-store", () => ({ default: {} }));
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
const fields = new Map<string, { value: string; onChangeText: (value: string) => void }>();
vi.mock("@/components/ui/input", () => ({ Input: (props: { accessibilityLabel: string; value: string; onChangeText: (value: string) => void }) => {
  fields.set(props.accessibilityLabel, props);
  return null;
} }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled: boolean }) => createElement("button", { onClick: onPress, disabled }, children) }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const key = ["settings", "git-identity"];
const saved = { name: "Daniel", email: "daniel@example.com" };
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fields.clear();
  mocks.save.mockReset().mockImplementation(async (input) => input);
  mocks.read.mockReset().mockResolvedValue(saved);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(key, saved);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(GitIdentityForm))));
});
afterEach(() => { act(() => root.unmount()); client.clear(); });
const edit = async (name: string, value: string) => act(async () => fields.get(name)!.onChangeText(value));
const submit = async () => act(async () => { container.querySelector("button")!.click(); });

it("validates fields before calling persistence", async () => {
  await edit("Git author email", "invalid");
  await submit();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Enter your Git author email");
});

it("preserves a draft when saved settings refresh", async () => {
  await edit("Git author name", "Draft author");
  await act(async () => { client.setQueryData(key, { name: "Other", email: "other@example.com" }); await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(fields.get("Git author name")!.value).toBe("Draft author");
  expect(fields.get("Git author email")!.value).toBe("other@example.com");
});

it("saves normalized form values and reports storage failures without success", async () => {
  await edit("Git author name", "  New author  ");
  await submit();
  expect(mocks.save).toHaveBeenCalledWith({ ...saved, name: "New author" }, expect.anything());
  expect(fields.get("Git author name")!.value).toBe("New author");
  mocks.save.mockRejectedValue(new Error("Storage full"));
  await edit("Git author name", "Another author");
  await submit();
  expect(container.textContent).toContain("Storage full");
  expect(container.textContent).not.toContain("Saved on this device.");
});
