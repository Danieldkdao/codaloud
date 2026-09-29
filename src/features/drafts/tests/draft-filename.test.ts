import { describe, expect, it } from "vitest";

import {
  nextAvailableDraftFilename,
  parseDraftFilename,
  resolveDraftLanguage,
} from "../lib/draft-filename";
import { formatDraftFileType, formatDraftTitle } from "../lib/formatters";

describe("draft filenames", () => {
  it("treats a blank value as an unnamed draft", () => {
    for (const value of [null, undefined, "", "   "])
      expect(parseDraftFilename(value)).toBeNull();
  });

  it("trims the name it keeps", () => {
    expect(parseDraftFilename("  helper.ts  ")).toBe("helper.ts");
  });

  it.each(["a/b.ts", "..\\..\\secret", ".", "..", "note\u0000.ts"])(
    "refuses the unsafe draft name %s",
    (value) => {
      expect(() => parseDraftFilename(value)).toThrow();
    },
  );

  it("refuses a name longer than one filesystem component", () => {
    expect(() => parseDraftFilename(`${"a".repeat(253)}.ts`)).toThrow();
    expect(parseDraftFilename(`${"a".repeat(240)}.ts`)).toBe(
      `${"a".repeat(240)}.ts`,
    );
  });

  it("measures the limit in bytes, not characters", () => {
    // Each é is two UTF-8 bytes, so 128 of them plus ".ts" exceeds 255 bytes.
    expect(() => parseDraftFilename(`${"é".repeat(128)}.ts`)).toThrow();
    expect(parseDraftFilename(`${"é".repeat(126)}.ts`)).toBe(
      `${"é".repeat(126)}.ts`,
    );
  });

  it("allows non-ascii names that carry an extension", () => {
    expect(parseDraftFilename("näive-çödé.ts")).toBe("näive-çödé.ts");
  });
});

describe("draft language", () => {
  it("edits an unnamed draft as plain text with no analysis", () => {
    expect(resolveDraftLanguage(null)).toEqual({
      fileType: "unsupported",
      editorFilename: "",
      highlighted: false,
      diagnostics: false,
      intelligence: false,
      formatting: false,
    });
  });

  it("keeps a named draft without an extension as plain text", () => {
    const language = resolveDraftLanguage("notes");
    expect(language).toMatchObject({
      fileType: "unsupported",
      editorFilename: "notes",
      highlighted: false,
      diagnostics: false,
    });
  });

  it("selects language behavior from the file extension", () => {
    expect(resolveDraftLanguage("helper.ts")).toMatchObject({
      fileType: "typescript",
      highlighted: true,
      diagnostics: true,
      intelligence: true,
      formatting: true,
    });
    expect(resolveDraftLanguage("idea.md")).toMatchObject({
      fileType: "markdown",
      diagnostics: true,
      intelligence: false,
      formatting: true,
    });
    expect(resolveDraftLanguage("script.py")).toMatchObject({
      fileType: "python",
      diagnostics: true,
      intelligence: false,
    });
    expect(resolveDraftLanguage("config.json")).toMatchObject({
      fileType: "json",
      formatting: true,
    });
    expect(resolveDraftLanguage(".env")).toMatchObject({ fileType: "env" });
  });

  it.each([
    ["main.ts", "typescript"],
    ["app.jsx", "javascript"],
    ["script.py", "python"],
    ["task.rb", "ruby"],
    ["build.sh", "shell"],
    ["README.md", "markdown"],
    ["Main.java", "java"],
    ["main.c", "c"],
    ["main.cpp", "cpp"],
    ["Program.cs", "csharp"],
    ["main.go", "go"],
    ["page.php", "php"],
    ["main.rs", "rust"],
    ["settings.json", "json"],
    ["settings.yaml", "yaml"],
    ["pyproject.toml", "toml"],
    ["doc.xml", "xml"],
    ["config.ini", "ini"],
    [".env", "env"],
    ["Dockerfile", "dockerfile"],
  ] as const)("enables diagnostics for %s", (filename, fileType) => {
    expect(resolveDraftLanguage(filename)).toMatchObject({
      fileType,
      highlighted: true,
      diagnostics: true,
    });
  });

  it("uses only the final extension of a dotted name", () => {
    expect(resolveDraftLanguage("helper.test.ts").fileType).toBe("typescript");
    expect(resolveDraftLanguage("archive.tar.gz").fileType).toBe("unsupported");
  });
});

describe("draft collision rename", () => {
  it("keeps a free name unchanged", () => {
    expect(nextAvailableDraftFilename("helper.ts", ["other.ts"])).toBe(
      "helper.ts",
    );
  });

  it("appends the first free counter before the extension", () => {
    expect(nextAvailableDraftFilename("helper.ts", ["helper.ts"])).toBe(
      "helper-1.ts",
    );
    expect(
      nextAvailableDraftFilename("helper.ts", ["helper.ts", "helper-1.ts"]),
    ).toBe("helper-2.ts");
  });

  it("keeps dotted names readable", () => {
    expect(
      nextAvailableDraftFilename("helper.test.ts", ["helper.test.ts"]),
    ).toBe("helper.test-1.ts");
    expect(nextAvailableDraftFilename("LICENSE", ["LICENSE"])).toBe(
      "LICENSE-1",
    );
    expect(nextAvailableDraftFilename(".env", [".env"])).toBe(".env-1");
  });

  it("ignores surrounding spaces in the requested name", () => {
    expect(nextAvailableDraftFilename("  helper.ts  ", [])).toBe("helper.ts");
  });

  it("eventually escapes a fully claimed counter range", () => {
    const taken = Array.from(
      { length: 100 },
      (_, index) => `a-${index + 1}.ts`,
    );
    expect(nextAvailableDraftFilename("a.ts", ["a.ts", ...taken])).toMatch(
      /^a-\d+\.ts$/,
    );
  });
});

describe("draft presentation", () => {
  it("shows unnamed drafts as Untitled Draft", () => {
    expect(formatDraftTitle({ filename: null })).toBe("Untitled Draft");
    expect(formatDraftTitle({ filename: "helper.ts" })).toBe("helper.ts");
  });

  it.each([
    ["typescript", "TypeScript"],
    ["javascript", "JavaScript"],
    ["cpp", "C++"],
    ["csharp", "C#"],
    ["env", "Environment"],
    ["unsupported", "Plain text"],
  ] as const)("labels the %s file type as %s", (fileType, label) => {
    expect(formatDraftFileType(fileType)).toBe(label);
  });
});
