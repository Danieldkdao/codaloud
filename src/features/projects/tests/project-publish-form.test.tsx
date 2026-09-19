// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectPublishForm } from "../components/project-publish-form";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(), run: vi.fn(), close: vi.fn(), connect: vi.fn(),
  connected: true, busy: false,
  counts: { hasRemote: false, currentBranch: "main", headSha: "a".repeat(40) as string | null },
}));
vi.mock("../hooks/use-project-git-operation", () => ({ useProjectGitOperation: () => ({ projectId: "project", isWorkspaceBusy: mocks.busy, run: mocks.run }) }));
vi.mock("../hooks/use-project-git-remote", () => ({ useProjectGitRemote: () => ({ data: mocks.counts, isFetching: false, error: null }) }));
vi.mock("../hooks/use-publish-project", () => ({ usePublishProject: () => ({ mutateAsync: mocks.publish, isPending: false, error: null }) }));
vi.mock("@/services/github/hooks/use-github-connected", () => ({ useGitHubConnected: () => ({ isConnected: mocks.connected, isChecking: false, isPending: false, handleConnect: mocks.connect }) }));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "theme" }));
vi.mock("@/components/ui/content-sheet", () => ({ ContentSheet: ({ open, children }: { open: boolean; children: ReactNode }) => open ? createElement("div", null, children) : null }));
vi.mock("@/components/ui/text", () => ({ PText: ({ children }: { children?: ReactNode }) => createElement("span", null, children) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onPress, disabled, accessibilityLabel }: { children?: ReactNode; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) => createElement("button", { onClick: onPress, disabled, "aria-label": accessibilityLabel }, children) }));
vi.mock("@/components/ui/input", () => ({ Input: ({ value, onChangeText, accessibilityLabel, multiline, editable }: { value: string; onChangeText: (value: string) => void; accessibilityLabel: string; multiline?: boolean; editable?: boolean }) => createElement(multiline ? "textarea" : "input", { value, "aria-label": accessibilityLabel, readOnly: editable === false, onInput: (event: { currentTarget: HTMLInputElement }) => onChangeText(event.currentTarget.value) }) }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("react-native", () => {
  const View = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return { View, ScrollView: View, KeyboardAvoidingView: View, Platform: { OS: "ios" }, useWindowDimensions: () => ({ width: 390, height: 844 }),
    Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityRole, accessibilityState }: { children?: ReactNode; onPress: () => void; disabled?: boolean; accessibilityLabel?: string; accessibilityRole?: string; accessibilityState?: { checked?: boolean } }) => createElement("button", { role: accessibilityRole, "aria-checked": accessibilityState?.checked, "aria-label": accessibilityLabel, disabled, onClick: onPress }, children),
  };
});
let root: Root;
let container: HTMLDivElement;
const render = () => act(() => root.render(createElement(ProjectPublishForm, { open: true, onOpenChange: mocks.close, projectName: "My project", enabled: true })));
const fill = (name: string, value: string) => act(() => {
  const input = container.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const submit = () => act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Publish repository"]')!.click(); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.connected = true; mocks.busy = false;
  mocks.counts = { hasRemote: false, currentBranch: "main", headSha: "a".repeat(40) };
  mocks.run.mockImplementation(async (_label, action) => { try { return await action(vi.fn()); } catch { return undefined; } });
  mocks.publish.mockResolvedValue({ repositoryUrl: "https://github.com/dev/mobile", warning: null });
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it("uses an input, optional textarea and private/public radio cards with safe defaults", async () => {
  render();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Repository name"]')?.value).toBe("My-project");
  expect(container.querySelector('textarea[aria-label="Repository description"]')).not.toBeNull();
  expect(container.querySelector('[role="radio"][aria-label="Private"]')?.getAttribute("aria-checked")).toBe("true");
  await submit();
  expect(mocks.publish).toHaveBeenCalledWith({ name: "My-project", description: "", private: true });
  expect(mocks.run).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledWith(false);
});

it("validates the required name with Zod and submits public repositories explicitly", async () => {
  render(); fill("Repository name", " "); await submit();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Repository name is required");
  fill("Repository name", "mobile"); fill("Repository description", "Description");
  act(() => container.querySelector<HTMLButtonElement>('[role="radio"][aria-label="Public"]')!.click());
  await submit();
  expect(mocks.publish).toHaveBeenCalledWith({ name: "mobile", description: "Description", private: false });
});

it("offers GitHub connection before publishing", async () => {
  mocks.connected = false; render(); await submit();
  expect(mocks.publish).not.toHaveBeenCalled();
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Connect GitHub"]')!.click());
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it.each(["remote", "unborn", "busy"])("blocks publishing for %s state", async (state) => {
  if (state === "remote") mocks.counts.hasRemote = true;
  if (state === "unborn") mocks.counts.headSha = null;
  if (state === "busy") mocks.busy = true;
  render(); await submit(); expect(mocks.publish).not.toHaveBeenCalled();
});

it("retains input on failure and blocks repeat submission while publishing", async () => {
  let fail!: (reason: Error) => void;
  mocks.publish.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  render(); fill("Repository name", "mobile"); await submit(); await submit();
  expect(mocks.publish).toHaveBeenCalledOnce();
  await act(async () => fail(new Error("Name taken")));
  expect(mocks.close).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Repository name"]')?.value).toBe("mobile");
});
