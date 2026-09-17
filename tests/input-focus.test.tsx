import { createRequire } from "node:module";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { twMerge } from "tailwind-merge";
import { expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";

const { compile } = createRequire(import.meta.url)("react-native-css/compiler") as
  typeof import("react-native-css/compiler");

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => children,
  TextInput: ({ className }: { className: string }) =>
    createElement("input", { className }),
}));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(" ")),
}));

it.each([false, true])(
  "keeps the focused input's border and outline inside its bounds (invalid=%s)",
  async (invalid) => {
    // Compile the real Input's classes through the same Tailwind/native CSS
    // pipeline. DOM-only form mocks cannot catch outlines clipped by native scroll views.
    const markup = renderToStaticMarkup(createElement(Input, { invalid }));
    const className = markup.match(/class="([^"]+)"/)?.[1];
    expect(className).toBeTruthy();
    const css = await postcss([tailwindcss()]).process(
      `@import "./src/global.css"; .input-focus-probe { @apply ${className}; }`,
      { from: `${process.cwd()}/input-focus-probe.css` },
    );
    const rules = compile(css.css).stylesheet().s?.find(
      ([name]) => name === "input-focus-probe",
    )?.[1];
    expect(rules?.some((rule) => rule.p?.f)).toBe(true);
    const declarations = (focused: boolean) => Object.assign({}, ...rules!
      .filter((rule) => !rule.p || (focused && rule.p.f))
      .flatMap((rule) => rule.d ?? [])
      .map((declaration) => Array.isArray(declaration)
        ? typeof declaration[1] === "string"
          ? { [declaration[1]]: declaration[0] }
          : {}
        : declaration));
    const idle = declarations(false);
    const focused = declarations(true);
    // An outward outline creates a second contour that gets clipped differently
    // depending on the input's position inside its form's scroll viewport.
    const outlineWidth = focused.outlineWidth ?? 0;
    const outlineOffset = focused.outlineOffset ?? 0;
    expect(typeof outlineWidth).toBe("number");
    expect(typeof outlineOffset).toBe("number");
    expect(outlineWidth + outlineOffset).toBeLessThanOrEqual(0);
    expect(focused.borderWidth).toBe(idle.borderWidth);
    expect(focused.borderColor).toBeDefined();
    expect(focused.outlineColor).toEqual(focused.borderColor);
  },
);
