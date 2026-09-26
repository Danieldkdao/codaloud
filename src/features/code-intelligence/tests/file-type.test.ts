import { describe, expect, it } from "vitest";
import { getCodeFileType } from "../file-type";

describe("getCodeFileType", () => {
  it.each([
    ["src/main.ts", "typescript"],
    ["src/main.tsx", "typescript"],
    ["src/main.mts", "typescript"],
    ["src/main.cts", "typescript"],
    ["src/main.js", "javascript"],
    ["src/main.jsx", "javascript"],
    ["src/main.mjs", "javascript"],
    ["src/main.cjs", "javascript"],
    ["main.py", "python"],
    ["src/Main.java", "java"],
    ["src/main.c", "c"],
    ["include/main.h", "c"],
    ["src/main.cpp", "cpp"],
    ["src/main.cc", "cpp"],
    ["src/main.cxx", "cpp"],
    ["include/main.hpp", "cpp"],
    ["src/main.cs", "csharp"],
    ["src/main.go", "go"],
    ["src/main.php", "php"],
    ["src/main.rs", "rust"],
    ["src/main.rb", "ruby"],
    ["README.md", "markdown"],
    ["config.json", "json"],
    ["config.jsonc", "jsonc"],
    ["config.json5", "json5"],
    ["config.yml", "yaml"],
    ["config.toml", "toml"],
    ["config.xml", "xml"],
    ["settings.ini", "ini"],
    [".env", "env"],
    [".env.local", "env"],
    ["Dockerfile", "dockerfile"],
    [".bashrc", "shell"],
    [".zshrc", "shell"],
    [".profile", "shell"],
    ["scripts/build.sh", "shell"],
  ] as const)("routes %s to %s", (path, expected) => {
    expect(getCodeFileType(path)).toBe(expected);
  });

  it.each([
    ["SRC/MAIN.PY", "python"],
    ["C:\\work\\MAIN.JAVA", "java"],
    ["/workspace/Dockerfile", "dockerfile"],
    ["/workspace/dockerfile", "dockerfile"],
  ] as const)("normalizes path %s", (path, expected) => {
    expect(getCodeFileType(path)).toBe(expected);
  });

  it.each([
    "unknown",
    "file.ini.backup",
    "Dockerfile.dev",
    "README",
    "deploy.fish",
  ])("returns unsupported for unknown or ambiguous format %s", (path) => {
    expect(getCodeFileType(path)).toBe("unsupported");
  });
});
