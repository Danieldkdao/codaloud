import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { getMaterialIconXml } from "@/lib/utils";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Alert: {} }));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => undefined }));

const require = createRequire(import.meta.url);
const iconDirectory = path.join(
  path.dirname(require.resolve("material-icon-theme/package.json")),
  "icons",
);
const readIcon = (name: string) =>
  readFileSync(path.join(iconDirectory, `${name}.svg`), "utf8");

it.each([
  ["project.ts", "typescript"],
  ["page.tsx", "react_ts"],
  ["package.json", "nodejs"],
  ["src/PACKAGE.JSON", "nodejs"],
  ["C:\\app\\package.json", "nodejs"],
  ["Dockerfile", "docker"],
  ["index.d.ts", "typescript-def"],
  ["button.test.ts", "test-ts"],
  ["globals.css", "css"],
])("resolves %s using the theme's associations", (name, icon) => {
  expect(getMaterialIconXml({ name, isDirectory: false })).toBe(readIcon(icon));
});

it.each(["unknown.zzzexample", "__proto__", "constructor", ""])(
  "uses a generic file for %s", (name) => {
    expect(getMaterialIconXml({ name, isDirectory: false })).toBe(readIcon("file"));
  },
);

it.each([
  ["components", "folder-react-components"],
  ["lib", "folder-lib"],
  [".github/workflows", "folder-gh-workflows"],
  ["unknown-folder", "folder"],
  ["package.json", "folder"],
])("resolves directory %s independently of file extensions", (name, icon) => {
  expect(getMaterialIconXml({ name, isDirectory: true })).toBe(readIcon(icon));
});

it("uses an expanded folder icon", () => {
  expect(getMaterialIconXml({ name: "components", isDirectory: true, expanded: true }))
    .toBe(readIcon("folder-react-components-open"));
});

it("uses light artwork and preserves base mappings without an override", () => {
  expect(getMaterialIconXml({ name: "next.config.ts", isDirectory: false, light: true }))
    .toBe(readIcon("next_light"));
  expect(getMaterialIconXml({ name: "package.json", isDirectory: false, light: true }))
    .toBe(readIcon("nodejs"));
});
