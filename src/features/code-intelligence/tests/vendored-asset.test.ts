import { afterEach, expect, it } from "vitest";
import {
  analyzerAssetSpecifiers,
  resolveVendoredAsset,
  setHostAssetResolver,
} from "../parsers/vendored-asset";

afterEach(() => setHostAssetResolver(() => undefined));

/**
 * The analyzers run in two hosts from one set of modules, and a literal
 * `require("./x.wasm")` must survive both; getting it wrong fails silently.
 */
it("uses the bundler's asset id when no host resolver is registered", () => {
  setHostAssetResolver(() => undefined);
  expect(resolveVendoredAsset("spec", () => 42)).toBe(42);
});

it("prefers the registered host resolver over the bundler asset", () => {
  // Inside a Metro server bundle the literal require returns an `/assets/?...` url
  // a filesystem reader cannot open, so the registered host resolver must win.
  setHostAssetResolver((specifier) => `/resolved/${specifier}`);
  expect(resolveVendoredAsset("runtimes/prism.wasm", () => 42)).toBe(
    "/resolved/runtimes/prism.wasm",
  );
});

it("falls back to the host resolver when the literal require throws", () => {
  setHostAssetResolver((specifier) => `/resolved/${specifier}`);
  const thrower = () => {
    throw new SyntaxError("Invalid or unexpected token");
  };
  expect(resolveVendoredAsset("runtimes/prism.wasm", thrower)).toBe(
    "/resolved/runtimes/prism.wasm",
  );
});

it("falls back to the host resolver when the literal require yields nothing", () => {
  setHostAssetResolver(() => "/resolved/asset.wasm");
  expect(resolveVendoredAsset("spec", () => undefined)).toBe("/resolved/asset.wasm");
});

it("reports no asset when neither host can resolve it", () => {
  const thrower = () => {
    throw new SyntaxError("Invalid or unexpected token");
  };
  expect(resolveVendoredAsset("spec", thrower)).toBeUndefined();
});

it("names every runtime the analyzers load as a repository path", () => {
  // A typo here is invisible until a language silently stops analyzing, so the
  // specifiers are asserted to be the real paths on disk.
  expect(analyzerAssetSpecifiers.prismRuntime).toBe(
    "src/features/code-intelligence/parsers/runtimes/prism.wasm",
  );
  expect(analyzerAssetSpecifiers.shellcheckRuntime).toBe(
    "src/features/code-intelligence/parsers/runtimes/shellcheck.wasm",
  );
  expect(analyzerAssetSpecifiers.goGrammar).toBe(
    "src/features/code-intelligence/parsers/grammars/go.wasm",
  );
});
