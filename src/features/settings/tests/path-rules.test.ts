import { expect, it } from "vitest";
import {
  parsePathRules,
  pathMatchesRule,
  pathRulesAreValid,
} from "../lib/path-rules";

it("matches directory names at any depth and project-relative paths by prefix", () => {
  const rules = parsePathRules("node_modules\nsrc/generated\n.env*\n");
  expect(rules).toEqual(["node_modules", "src/generated", ".env*"]);
  expect(
    pathMatchesRule("packages/app/node_modules/pkg/index.d.ts", rules),
  ).toBe(true);
  expect(pathMatchesRule("src/generated/api.ts", rules)).toBe(true);
  expect(pathMatchesRule(".env.production.local", rules)).toBe(true);
  expect(pathMatchesRule("src/node_modules-like.ts", rules)).toBe(false);
});

it("rejects traversal, absolute paths, broad wildcard patterns, and oversized lists", () => {
  expect(
    parsePathRules("../secret\n/etc\n*\nnode_modules\nnode_modules"),
  ).toEqual(["node_modules"]);
  expect(
    parsePathRules(
      Array.from({ length: 40 }, (_, i) => `folder-${i}`).join("\n"),
    ),
  ).toHaveLength(30);
});

it("flags invalid or oversized protection lists instead of silently dropping rules", () => {
  expect(pathRulesAreValid(".env*\nnode_modules")).toBe(true);
  expect(pathRulesAreValid(".env*\n../secret")).toBe(false);
  expect(
    pathRulesAreValid(
      Array.from({ length: 31 }, (_, i) => `p-${i}`).join("\n"),
    ),
  ).toBe(false);
});
