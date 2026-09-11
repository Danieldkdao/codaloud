// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";

const getItems = (page: { items: readonly { id: number; name: string }[] }) => page.items;
const getKey = (item: { id: number }) => item.id;
let result: { id: number; name: string }[];
const Probe = ({ pages, keySelector = getKey }: {
  pages?: readonly { items: readonly { id: number; name: string }[] }[];
  keySelector?: (item: { id: number; name: string }) => PropertyKey;
}) => {
  result = useUniquePaginatedItems(pages, getItems, keySelector);
  return null;
};

it("returns an empty typed array for absent or empty pages", () => {
  renderToStaticMarkup(createElement(Probe));
  expect(result).toEqual([]);
  renderToStaticMarkup(createElement(Probe, { pages: [] }));
  expect(result).toEqual([]);
});

it("preserves source order and the first duplicate without mutating pages", () => {
  const first = Object.freeze({ id: 2, name: "first" });
  const pages = Object.freeze([
    { items: Object.freeze([first, { id: 1, name: "one" }, { id: 2, name: "duplicate" }]) },
    { items: Object.freeze([]) },
    { items: Object.freeze([{ id: 1, name: "updated" }, { id: 3, name: "three" }]) },
  ]);
  renderToStaticMarkup(createElement(Probe, { pages }));
  expect(result).toEqual([first, { id: 1, name: "one" }, { id: 3, name: "three" }]);
  expect(result[0]).toBe(first);
  expect(pages[0].items).toHaveLength(3);
});

it("supports different page shapes and string keys with inferred item types", () => {
  let names: string[] = [];
  const Branches = () => {
    const branches = useUniquePaginatedItems(
      [{ branches: [{ name: "main" }, { name: "Main" }] }, { branches: [{ name: "main" }] }],
      (page) => page.branches,
      (branch) => branch.name,
    );
    names = branches.map((branch) => branch.name);
    return null;
  };
  renderToStaticMarkup(createElement(Branches));
  expect(names).toEqual(["main", "Main"]);
});

it("memoizes stable inputs and updates when pages or identity rules change", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  try {
    const pages = [{ items: [{ id: 1, name: "same" }, { id: 2, name: "same" }] }];
    act(() => root.render(createElement(Probe, { pages })));
    const previous = result;
    act(() => root.render(createElement(Probe, { pages })));
    expect(result).toBe(previous);
    act(() => root.render(createElement(Probe, { pages, keySelector: (item) => item.name })));
    expect(result).toEqual([pages[0].items[0]]);
    act(() => root.render(createElement(Probe, { pages: [{ items: [{ id: 3, name: "new" }] }] })));
    expect(result).toEqual([{ id: 3, name: "new" }]);
  } finally {
    act(() => root.unmount());
  }
});
