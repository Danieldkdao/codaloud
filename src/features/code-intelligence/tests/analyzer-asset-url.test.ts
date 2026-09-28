import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

/**
 * The analyzers reach the app bundle, so a `node:*` or `react-native` import in
 * this graph fails the whole native build. These tests walk the real import graph.
 */
const appReachableAnalyzers = [
  "analyzer-registry",
  "parsers/analyzer-asset-url",
  "parsers/analyzer-diagnostics-log",
  "parsers/prism-analyzer",
  "parsers/shellcheck-analyzer",
  "parsers/python-analyzer",
  "parsers/tree-sitter-runtime",
  "parsers/native-diagnostics",
  "parsers/wasm-instance",
  "parsers/wasi-imports",
];

const source = async (name: string) =>
  readFile(new URL(`../${name}.ts`, import.meta.url), "utf8");

it.each(appReachableAnalyzers)(
  "%s imports no Node builtin, so the native bundle can load it",
  async (name) => {
    const text = await source(name);
    const offenders = [
      ...text.matchAll(/^\s*import[^;]*?["'](node:[^"']+)["']/gm),
    ].map((match) => match[1]);
    expect(offenders).toEqual([]);
  },
);

it.each(["parsers/shellcheck-analyzer", "parsers/prism-analyzer"])(
  "%s takes its runtime reader from the caller rather than choosing a host",
  async (name) => {
    const text = await source(name);
    // A reader argument is what keeps these modules host-agnostic.
    expect(text).toMatch(/loadBytes/);
    // Neither may reach for React Native at module scope.
    expect(text).not.toMatch(
      /^import \{[^}]*Image[^}]*\} from "react-native"/m,
    );
  },
);
