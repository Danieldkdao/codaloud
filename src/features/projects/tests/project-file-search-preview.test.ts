import { describe, expect, it } from "vitest";
import { getProjectFileSearchScope, searchProjectFiles } from "@/features/projects/lib/file-search";
import { formatProjectFileMatchCount } from "@/features/projects/lib/formatters";

const files = [
  { path: "src/project.ts", content: "export const name = 'workspace';" },
  { path: "docs/guide.md", content: "Project setup. PROJECT files. project." },
  { path: "docs/project.md", content: "project ".repeat(12) },
  { path: "project/unrelated.ts", content: "const pattern = '[a-z]';" },
];

describe("mock workspace search", () => {
  it("searches both fields when both filters are off or on", () => {
    expect(getProjectFileSearchScope(false, false)).toBe("all");
    expect(getProjectFileSearchScope(true, true)).toBe("all");
    const results = searchProjectFiles(files, " PROJECT ", "all");
    expect(results.map(({ file }) => file.path).sort()).toEqual([
      "docs/guide.md", "docs/project.md", "src/project.ts",
    ]);
    expect(results.find(({ file }) => file.path === "docs/guide.md")?.contentMatchCount).toBe(3);
  });

  it("narrows to title only without matching the parent folder or content", () => {
    const results = searchProjectFiles(files, "project", getProjectFileSearchScope(true, false));
    expect(results.map(({ file }) => file.path).sort()).toEqual(["docs/project.md", "src/project.ts"]);
    expect(results.every(({ contentMatchCount }) => contentMatchCount === 0)).toBe(true);
  });

  it("narrows to content only and returns each file once", () => {
    const results = searchProjectFiles(files, "project", getProjectFileSearchScope(false, true));
    expect(results.map(({ file }) => file.path).sort()).toEqual(["docs/guide.md", "docs/project.md"]);
    expect(results.every(({ titleMatches }) => !titleMatches)).toBe(true);
  });

  it("handles empty input, no results, and literal punctuation", () => {
    expect(searchProjectFiles(files, "   ", "all")).toEqual([]);
    expect(searchProjectFiles(files, "missing", "all")).toEqual([]);
    expect(searchProjectFiles(files, "[a-z]", "content")[0]?.file.path).toBe("project/unrelated.ts");
  });

  it("shows exact counts below ten and a compact cap at ten", () => {
    expect(formatProjectFileMatchCount(1)).toBe("1 match found in this file");
    expect(formatProjectFileMatchCount(9)).toBe("9 matches found in this file");
    expect(formatProjectFileMatchCount(10)).toBe("10+ matches found in this file");
    expect(formatProjectFileMatchCount(12)).toBe("10+ matches found in this file");
  });
});
