// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  importFile: vi.fn(),
  menu: null as null | {
    sections: {
      options: {
        value: string;
        onSelect: () => void;
        subactions?: { value: string; onSelect: () => void }[];
      }[];
    }[];
  },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("expo-router/ui", () => ({
  TabTrigger: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 0 }),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  Pressable: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  PText: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock("@/features/projects/components/create-project-button", () => ({
  CreateProjectButton: () => createElement("div", null, "+"),
}));
vi.mock("@/features/drafts/hooks/use-import-draft-file", () => ({
  useImportDraftFile: () => ({ importFile: mocks.importFile }),
}));
vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: (props: typeof mocks.menu) => {
    mocks.menu = props;
    return createElement("div");
  },
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

import { MainTabBar } from "../main-tab-bar";

it("offers Project and Draft, with new and import actions nested under Draft", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(MainTabBar)));
  const options = mocks.menu!.sections[0].options;
  expect(options.map((option) => option.value)).toEqual(["project", "draft"]);
  options[0].onSelect();
  expect(mocks.push).toHaveBeenCalledWith("/new-project");
  expect(options[1].subactions?.map((item) => item.value)).toEqual([
    "new",
    "import",
  ]);
  options[1].subactions![0].onSelect();
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/draft/[draftId]",
    params: { draftId: "new" },
  });
  options[1].subactions![1].onSelect();
  expect(mocks.importFile).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
