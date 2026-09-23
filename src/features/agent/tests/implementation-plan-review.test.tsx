// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImplementationPlanReview } from "../components/implementation-plan-review";

const mocks = vi.hoisted(() => ({
  plans: [] as any[],
  approve: vi.fn(),
  discard: vi.fn(),
  details: vi.fn(),
  sheet: {} as any,
  input: {} as any,
}));
vi.mock("../plan-runtime", () => ({
  agentPlans: {
    getSnapshot: () => mocks.plans,
    subscribe: () => () => {},
    approve: mocks.approve,
    discard: mocks.discard,
    updateDetails: mocks.details,
  },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: ({ children, testID, style }: any) =>
    createElement("div", { "data-testid": testID, style }, children),
  ScrollView: ({ children, testID, style }: any) =>
    createElement("section", { "data-testid": testID, style }, children),
}));
vi.mock("@/hooks/use-keyboard-frame", () => ({
  useKeyboardFrame: () => undefined,
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "inherit" }));
vi.mock("@/components/ui/content-sheet", () => ({
  ContentSheet: (props: any) => {
    mocks.sheet = props;
    return props.open
      ? createElement("div", { role: "dialog" }, props.children)
      : null;
  },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled, loading }: any) =>
    createElement(
      "button",
      { onClick: onPress, disabled: disabled || loading },
      children,
    ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.input = props;
    return createElement("textarea", {
      "aria-label": props.accessibilityLabel,
      value: props.value,
      readOnly: true,
    });
  },
}));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: any) => createElement("p", null, children),
}));
vi.mock("@/components/markdown-text", () => ({
  MarkdownText: ({ text }: any) => createElement("article", null, text),
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const render = () =>
  act(() => root.render(<ImplementationPlanReview projectId="project" />));
const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find(
    (entry) => entry.textContent === label,
  )!;
  await act(async () => button.click());
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.plans = [
    {
      requestKey: "plan",
      projectId: "project",
      title: "Create greeting",
      instruction: "## Changes\n- Create `greeting.ts`",
      details: "",
      resolved: false,
    },
  ];
  mocks.approve.mockReset().mockResolvedValue(undefined);
  mocks.discard.mockReset().mockResolvedValue(undefined);
  mocks.details.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it("opens the Markdown plan automatically with fixed controls outside its bounded scroller", () => {
  render();
  const scroll = container.querySelector(
    '[data-testid="implementation-plan-scroll"]',
  )!;
  expect(scroll.textContent).toContain("greeting.ts");
  expect(scroll.querySelector("textarea")).toBeNull();
  expect(scroll.querySelector("button")).toBeNull();
  expect(
    container
      .querySelector('[data-testid="implementation-plan-body"]')
      ?.getAttribute("style"),
  ).toContain("height");
  expect(mocks.approve).not.toHaveBeenCalled();
});
it("saves corrections and passes them to explicit approval", async () => {
  render();
  await act(async () => mocks.input.onChangeText("Use greeter.ts instead"));
  expect(mocks.details).toHaveBeenCalledWith("plan", "Use greeter.ts instead");
  await click("Approve & start");
  expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(
    "plan",
    "Use greeter.ts instead",
  );
});
it("dismisses without approving and reopens the saved plan", async () => {
  render();
  act(() => mocks.sheet.onOpenChange(false));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.approve).not.toHaveBeenCalled();
  expect(mocks.discard).not.toHaveBeenCalled();
  await click("Review plan");
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});
it("keeps a failed approval visible with its corrections for retry", async () => {
  mocks.approve.mockRejectedValueOnce(new Error("Connection lost"));
  render();
  await act(async () => mocks.input.onChangeText("Exact filename"));
  await click("Approve & start");
  expect(container.textContent).toContain("Connection lost");
  expect(mocks.input.value).toBe("Exact filename");
});
it("ignores other projects and discards only the selected plan", async () => {
  mocks.plans.unshift({
    ...mocks.plans[0],
    projectId: "other",
    requestKey: "other",
  });
  render();
  await click("Discard");
  expect(mocks.discard).toHaveBeenCalledExactlyOnceWith("plan");
  expect(mocks.approve).not.toHaveBeenCalled();
});
