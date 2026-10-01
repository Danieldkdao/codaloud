// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pathname: "/projects",
  params: {} as { projectId?: string; draftId?: string },
  stop: vi.fn(),
  conversation: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useGlobalSearchParams: () => mocks.params,
  usePathname: () => mocks.pathname,
  useRouter: () => ({}),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0 }),
}));
vi.mock("../hooks/use-voice-conversation", () => ({
  useVoiceConversation: mocks.conversation,
}));
vi.mock("../components/voice-transcript-bubble", () => ({
  VoiceTranscriptBubble: () => createElement("div", { "data-bubble": true }),
}));
vi.mock("../components/voice-command-overlay", () => ({
  VoiceCommandOverlay: ({ children, scope }: any) =>
    createElement("div", { "data-overlay-scope": scope }, children(420)),
}));
vi.mock("../components/voice-microphone", () => ({
  VoiceMicrophone: () => createElement("button", null, "Microphone"),
}));
vi.mock("@/features/agent/hooks/use-agent-tasks", () => ({
  useAgentTasks: () => [],
}));
import { AppCommandProvider } from "../hooks/app-command-provider";
import { commandCenter } from "../command-center";
import { inlineSession } from "../inline-session";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/projects";
  mocks.params = {};
  mocks.conversation.mockReturnValue({ stop: mocks.stop });
  commandCenter.clear();
  inlineSession.cancel();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it("keeps project command controls in the editor and out of every supporting route", async () => {
  const render = () =>
    root.render(
      <AppCommandProvider enabled>
        <span>App</span>
      </AppCommandProvider>,
    );
  for (const pathname of [
    "/projects",
    "/account",
    "/billing",
    "/editor",
    "/draft/one",
  ]) {
    mocks.pathname = pathname;
    await act(async () => render());
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[data-bubble]")).toBeNull();
    expect(mocks.conversation.mock.lastCall?.[0]).toBe(false);
  }
  mocks.params = { projectId: "one" };
  for (const panel of [
    "code",
    "files",
    "files/preview",
    "git",
    "agent",
    "settings",
    "code",
  ]) {
    mocks.pathname = `/projects/one/${panel}`;
    await act(async () => render());
    expect(Boolean(container.querySelector("[data-bubble]"))).toBe(
      panel === "code",
    );
    expect(container.querySelector("button")).toBeNull();
    expect(mocks.conversation.mock.lastCall?.slice(0, 3)).toEqual([
      panel === "code",
      "project:one",
      "one",
    ]);
  }
});
it("stops voice and cancels pending inputs when opening a project route", async () => {
  mocks.params = { projectId: "one" };
  mocks.pathname = "/projects/one/code";
  const render = () =>
    root.render(
      <AppCommandProvider enabled>
        <span>App</span>
      </AppCommandProvider>,
    );
  await act(async () => render());
  const cancel = vi.fn();
  commandCenter.begin(cancel);
  commandCenter.open("one");
  mocks.stop.mockClear();
  mocks.pathname = "/projects/one/files";
  await act(async () => render());
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
  expect(commandCenter.getSnapshot().input).toBeNull();
  expect(container.querySelector("[data-bubble]")).toBeNull();
});
it("cancels pending commands and clears results when manually leaving or switching resources", async () => {
  mocks.pathname = "/projects/one/code";
  mocks.params = { projectId: "one" };
  const render = () =>
    root.render(
      <AppCommandProvider enabled>
        <span>App</span>
      </AppCommandProvider>,
    );
  await act(async () => render());
  const cancel = vi.fn();
  commandCenter.begin(cancel);
  commandCenter.open("one");
  await inlineSession.begin("one", "agent");
  mocks.pathname = "/projects/two/code";
  mocks.params = { projectId: "two" };
  await act(async () => render());
  expect(cancel).toHaveBeenCalledOnce();
  expect(commandCenter.getSnapshot().input).toBeNull();
  expect(inlineSession.getSnapshot()).toBeNull();
  mocks.pathname = "/projects";
  // Global params can lag a dismissed project; the pathname remains authoritative.
  await act(async () => render());
  expect(container.querySelector("[data-bubble]")).toBeNull();
  expect(mocks.stop).toHaveBeenCalled();
});
