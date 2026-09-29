// @vitest-environment happy-dom
import {
  act,
  createElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  images: [] as Record<string, unknown>[],
  paths: { document: { uri: "file:///var/mobile/Documents/" } },
}));

vi.mock("expo-file-system", () => ({
  Paths: mocks.paths,
  File: class {},
  Directory: class {},
}));

import { ProjectImagePreviewContent } from "@/features/projects/components/project-image-preview-content";

vi.mock("@/components/ui/image", () => ({
  Image: (props: Record<string, unknown>) => {
    mocks.images.push(props);
    return createElement("div", {
      "data-image": String((props.source as { default: string }).default),
      style: props.style as object,
    });
  },
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    className,
    style,
    accessibilityRole,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    className?: string;
    style?: Record<string, string | number>;
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "div",
      { className, style, role: accessibilityRole, "aria-label": accessibilityLabel },
      children,
    ),
  ActivityIndicator: () => createElement("progress"),
}));
vi.mock("@/components/ui/text", () => {
  const Text = ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children);
  return { PText: Text, HeadingText: Text };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, accessibilityLabel }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { onClick: onPress, "aria-label": accessibilityLabel },
      children,
    ),
}));

const projectId = "00000000-0000-4000-8000-0000000000c9";
const uri = `file:///var/mobile/Documents/codaloud-workspaces/${projectId}/assets/logo.png`;

let root: Root;
let container: HTMLDivElement;
const render = (props: Record<string, unknown> = {}) =>
  act(() =>
    root.render(
      createElement(ProjectImagePreviewContent, {
        projectId,
        filePath: "assets/logo.png",
        dockHeight: 72,
        ...props,
      }),
    ),
  );
const load = (width = 1024, height = 512) => {
  const image = mocks.images.at(-1) as {
    onLoad: (event: { source: { width: number; height: number } }) => void;
  };
  act(() => image.onLoad({ source: { width, height } }));
};
const fail = () => {
  const image = mocks.images.at(-1) as { onError: () => void };
  act(() => image.onError());
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  mocks.images.length = 0;
});

afterEach(() => act(() => root.unmount()));

describe("ProjectImagePreviewContent", () => {
  it("decodes the workspace file, contained to the screen", () => {
    render();
    const image = mocks.images[0] as Record<string, unknown>;
    expect(image.source).toEqual({
      default:
        "file:///var/mobile/Documents/codaloud-workspaces/00000000-0000-4000-8000-0000000000c9/assets/logo.png",
    });
    expect(image.contentFit).toBe("contain");
    expect((image.style as { flex: number }).flex).toBe(1);
  });

  it("holds a loading state until the picture decodes", () => {
    render();
    expect(container.textContent).toContain("Reading this image…");
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.querySelector("span[aria-label]")).toBeNull();
    load();
    expect(container.textContent).not.toContain("Reading this image…");
  });

  it("reports the pixel and byte size once it is visible", () => {
    render({ size: 2 * 1024 * 1024 });
    load();
    expect(container.textContent).toContain("1024 × 512 px");
    expect(container.textContent).toContain("2 MB");
    expect(mocks.images.at(-1)).toMatchObject({
      accessibilityLabel: "assets/logo.png, 1024 by 512 pixels",
    });
  });

  it("omits a byte size the listing never reported", () => {
    render();
    load(64, 64);
    expect(container.textContent).toContain("64 × 64 px");
    expect(container.textContent).not.toContain("·");
  });

  it("settles after repeated load events for the same picture", () => {
    render();
    load();
    const before = container.innerHTML;
    load();
    expect(container.innerHTML).toBe(before);
  });

  it("explains a decode failure instead of showing a blank screen", () => {
    render();
    fail();
    expect(container.textContent).toContain("Can't show this image");
    expect(container.textContent).toContain("assets/logo.png");
    expect(mocks.images).toHaveLength(1);
  });

  it("retries the decode and returns to the picture", () => {
    render();
    load();
    fail();
    expect(container.textContent).toContain("Can't show this image");

    const retry = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Try showing this image again"]',
    )!;
    const decodedUri = mocks.images.at(-1);
    act(() => retry.click());
    expect(container.textContent).toContain("Reading this image…");
    expect(mocks.images.at(-1)).not.toBe(decodedUri);
    load(300, 200);
    expect(container.textContent).toContain("300 × 200 px");
    expect(container.textContent).not.toContain("Can't show this image");
  });

  it("keeps the dock clear of the caption", () => {
    render({ dockHeight: 96, size: 10 });
    load();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.paddingBottom).toBe("112px");
  });
});
