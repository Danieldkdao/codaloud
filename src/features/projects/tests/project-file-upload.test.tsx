// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const projectId = "00000000-0000-4000-8000-0000000000cc";

const mocks = vi.hoisted(() => ({
  sections: [] as {
    label?: string;
    options: { label: string; onSelect?: () => void }[];
  }[],
  alerts: [] as unknown[][],
  /** Picker transports, mirrored from expo-file-system's real result shapes. */
  filePick: { canceled: false as boolean, result: [] as { uri: string; name: string; size: number }[] | null },
  directoryChildren: [] as { uri: string; name: string; size: number }[],
  importAction: vi.fn(),
  operation: vi.fn(),
  success: vi.fn(),
  setQuery: vi.fn(),
  begin: vi.fn(),
  dismissTo: vi.fn(),
  push: vi.fn(),
  busy: { value: false },
}));

// Classes live inside the factory: vitest hoists vi.mock above module scope.
vi.mock("expo-file-system", () => {
  class FakeFile {
    uri: string;
    name: string;
    size: number;
    static pickFileAsync = () => Promise.resolve(mocks.filePick);
    constructor(uri: string, name: string, size: number) {
      this.uri = uri;
      this.name = name;
      this.size = size;
    }
  }
  class FakeDirectory {
    uri: string;
    name = "my-app";
    static pickDirectoryAsync = () =>
      Promise.resolve(new FakeDirectory("file:///tmp/picked/my-app"));
    constructor(uri: string) {
      this.uri = uri;
    }
    list() {
      return mocks.directoryChildren.map((child) =>
        new FakeFile(child.uri, child.name, child.size),
      );
    }
  }
  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: { uri: "file:///var/mobile/Documents/" } },
  };
});
vi.mock("@/services/local-workspace/execute", () => ({
  executeWorkspace: vi.fn(async () => []),
  LocalWorkspaceError: class extends Error {},
}));
vi.mock("@/features/projects/local/access", () => ({
  requireLocalProject: async (id: string) => ({ id }),
}));
vi.mock("@/features/projects/local/file-paths", () => ({
  readLocalFilePaths: vi.fn(async () => []),
}));
vi.mock("@/features/projects/actions/import-actions", () => ({
  importProjectFilesAction: mocks.importAction,
}));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  alert: (...args: unknown[]) => mocks.alerts.push(args),
}));

import { ProjectFilesAdd } from "@/features/projects/components/project-files-add";

vi.mock("@/components/ui/native-select", () => ({
  NativeSelect: ({ sections }: {
    label: string;
    sections: { label?: string; options: { value?: string; label: string; onSelect?: () => void }[] }[];
  }) => {
    mocks.sections = sections;
    return createElement(
      "div",
      { "data-select": true },
      sections.flatMap((section) =>
        section.options.map((option) =>
          createElement(
            "button",
            { key: option.value ?? option.label, onClick: option.onSelect },
            option.label,
          ),
        ),
      ),
    );
  },
}));
vi.mock("@/features/projects/hooks/use-project-workspace-branch", () => ({
  useProjectWorkspaceBranch: () => ({
    projectId,
    isWorkspaceBusy: mocks.busy.value,
    runWorkspaceOperation: (
      label: string,
      run: (assertCurrent: () => void) => Promise<void>,
    ) => {
      mocks.operation(label);
      return run(() => undefined);
    },
  }),
}));
vi.mock("@/features/projects/hooks/use-project-workspace-file-search", () => ({
  useProjectWorkspaceFileSearch: () => ({
    query: "",
    setQuery: mocks.setQuery,
    currentDirectory: "src",
  }),
}));
vi.mock("@/features/projects/hooks/use-project-workspace-file-creation", () => ({
  useProjectWorkspaceFileCreation: () => ({
    kind: null,
    naming: false,
    begin: mocks.begin,
  }),
}));
vi.mock("@/hooks/use-success-feedback", () => ({
  useSuccessFeedback: () => mocks.success,
}));
vi.mock("@/components/ui/glass-surface", () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/app-wrapper", () => ({
  AppWrapper: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement("button", { onClick: onPress }, children),
}));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children);
  return { PText: Text, HeadingText: Text };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", () => ({ Input: () => createElement("input") }));
vi.mock("@/components/ui/content-sheet", () => ({
  ContentSheet: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/ui/keyboard-aware-view", () => ({
  KeyboardAwareView: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/hooks/use-theme", () => ({ useThemeColor: () => "transparent" }));
vi.mock("expo-router", () => ({
  Stack: () => null,
  useRouter: () => ({ push: mocks.push, dismissTo: mocks.dismissTo }),
  useLocalSearchParams: () => ({ projectId }),
}));
vi.mock("react-native", async () => {
  const { createElement: h } = await import("react");
  return {
    Alert: { alert: (...args: unknown[]) => mocks.alerts.push(args) },
    Keyboard: { dismiss: vi.fn() },
    Platform: { OS: "ios" },
    View: ({ children, className }: { children?: ReactNode; className?: string }) =>
      h("div", { className }, children),
    Text: ({ children }: { children?: ReactNode }) => h("span", null, children),
    StyleSheet: { compose: (a: unknown, b: unknown) => [a, b], flatten: (v: unknown) => v },
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  };
});

const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
let root: Root;
let container: HTMLDivElement;

const uploaded = (name: string, size = 12) => ({
  relativePath: name,
  name,
  uri: `file:///tmp/picked/${name}`,
  size,
});
const imported = {
  error: false as const,
  message: "Uploaded 1 file to this project.",
  data: { imported: ["src/a.ts"], replaced: [], skipped: [] },
};

const render = async () => {
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(ProjectFilesAdd)),
    );
  });
};

const press = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
  if (!button) throw new Error(`No control labelled ${label}`);
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

const pressAlertButton = async (index: number) => {
  const buttons = mocks.alerts.at(-1)?.[2] as
    | { text: string; onPress?: () => void }[]
    | undefined;
  await act(async () => {
    buttons?.[index].onPress?.();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  mocks.sections.length = 0;
  mocks.alerts.length = 0;
  mocks.busy.value = false;
  mocks.filePick = {
    canceled: false,
    result: [{ uri: "file:///tmp/picked/a.ts", name: "a.ts", size: 12 }],
  };
  mocks.directoryChildren = [
    { uri: "file:///tmp/picked/app.ts", name: "app.ts", size: 30 },
  ];
  mocks.importAction.mockReset();
  mocks.importAction.mockResolvedValue(imported);
  mocks.operation.mockReset();
  mocks.success.mockReset();
  mocks.setQuery.mockReset();
  mocks.begin.mockReset();
  mocks.dismissTo.mockReset();
  await render();
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("Files add menu", () => {
  it("offers create and upload choices in one menu", () => {
    expect(mocks.sections.map((section) => section.label)).toEqual(["Create", "Upload"]);
    expect(
      mocks.sections.flatMap((section) => section.options.map((option) => option.label)),
    ).toEqual([
      "Folder",
      "File",
      "File from this device",
      "Folder from this device",
    ]);
  });

  it("still creates a folder in the browsed directory", async () => {
    await press("Folder");
    expect(mocks.setQuery).toHaveBeenCalledWith("");
    expect(mocks.begin).toHaveBeenCalledWith("folder");
  });

  it("uploads a picked file into the folder being browsed", async () => {
    await press("File from this device");
    await vi.waitFor(() => expect(mocks.importAction).toHaveBeenCalled());
    expect(mocks.importAction).toHaveBeenCalledWith(
      projectId,
      { directoryPath: "src", items: [uploaded("a.ts")], mode: "fail" },
    );
    expect(mocks.operation).toHaveBeenCalledWith("Uploading files…");
    expect(mocks.success).toHaveBeenCalledWith("Uploaded 1 file to this project.");
  });

  it("walks a picked folder into project-relative paths first", async () => {
    mocks.filePick.canceled = true;
    mocks.filePick.result = null;
    await press("Folder from this device");
    expect(mocks.importAction).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({
        items: [uploaded("app.ts", 30)],
        mode: "fail",
      }),
    );
  });

  it("does nothing when the user dismisses the picker", async () => {
    mocks.filePick.canceled = true;
    mocks.filePick.result = null;
    await press("File from this device");
    expect(mocks.importAction).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("warns about an empty folder instead of importing nothing", async () => {
    mocks.filePick.canceled = true;
    mocks.filePick.result = null;
    mocks.directoryChildren = [];
    await press("Folder from this device");
    expect(mocks.alerts.at(-1)?.[0]).toBe("That selection has no files to upload.");
    expect(mocks.importAction).not.toHaveBeenCalled();
  });

  it("asks for a decision when files already exist, then replaces", async () => {
    mocks.importAction.mockResolvedValueOnce({
      error: true,
      code: "IMPORT_CONFLICT",
      message: "1 file already exists in this project.",
      conflicts: ["src/a.ts"],
    });
    await press("File from this device");
    expect(mocks.alerts.at(-1)?.[0]).toBe("Some files already exist");
    expect(
      (mocks.alerts.at(-1)?.[2] as { text: string }[]).map((button) => button.text),
    ).toEqual(["Cancel", "Skip them", "Replace"]);

    await pressAlertButton(2);
    expect(mocks.importAction).toHaveBeenLastCalledWith(
      projectId,
      expect.objectContaining({ mode: "replace" }),
    );
    expect(mocks.success).toHaveBeenCalled();
  });

  it("skips existing files when the user chooses skip", async () => {
    mocks.importAction.mockResolvedValueOnce({
      error: true,
      code: "IMPORT_CONFLICT",
      message: "2 files already exist in this project.",
      conflicts: ["src/a.ts", "src/b.ts"],
    });
    await press("File from this device");
    await pressAlertButton(1);
    expect(mocks.importAction).toHaveBeenLastCalledWith(
      projectId,
      expect.objectContaining({ mode: "skip" }),
    );
  });

  it("abandons the upload when the user cancels the clash", async () => {
    mocks.importAction.mockResolvedValueOnce({
      error: true,
      code: "IMPORT_CONFLICT",
      message: "clash",
      conflicts: ["src/a.ts"],
    });
    await press("File from this device");
    const calls = mocks.importAction.mock.calls.length;
    await pressAlertButton(0);
    expect(mocks.importAction.mock.calls.length).toBe(calls);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("explains a failure that is not a clash", async () => {
    mocks.importAction.mockResolvedValue({
      error: true,
      code: "IMPORT_NOT_VISIBLE",
      message: "The project could not read 1 uploaded file.",
    });
    await press("File from this device");
    expect(mocks.alerts.at(-1)).toEqual([
      "Couldn't upload these files",
      "The project could not read 1 uploaded file.",
    ]);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("stays quiet when everything was skipped", async () => {
    mocks.importAction.mockResolvedValue({
      error: false,
      message: "Nothing to upload — every file already exists here.",
      data: { imported: [], replaced: [], skipped: ["src/a.ts"] },
    });
    await press("File from this device");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("refuses to open the picker while a workspace operation runs", async () => {
    mocks.busy.value = true;
    await render();
    await press("File from this device");
    expect(mocks.importAction).not.toHaveBeenCalled();
  });
});
