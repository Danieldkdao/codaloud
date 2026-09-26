export const codeFileTypes = [
  "typescript",
  "javascript",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "php",
  "rust",
  "ruby",
  "markdown",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "toml",
  "xml",
  "ini",
  "env",
  "dockerfile",
  "shell",
] as const;

export type CodeFileType = (typeof codeFileTypes)[number] | "unsupported";

const formatFileTypes = new Set<CodeFileType>([
  "markdown",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "toml",
  "xml",
  "ini",
  "env",
  "dockerfile",
  "shell",
]);

export const isFormatFileType = (fileType: CodeFileType) =>
  formatFileTypes.has(fileType);

export const hasLocalCodeAnalyzer = (fileType: CodeFileType) =>
  fileType !== "typescript" &&
  fileType !== "javascript" &&
  fileType !== "unsupported";

const typescriptExtensions = new Set(["ts", "tsx", "mts", "cts"]);
const javascriptExtensions = new Set(["js", "jsx", "mjs", "cjs"]);
const cppExtensions = new Set(["cc", "cpp", "cxx", "hpp", "hh", "hxx"]);
const shellExtensions = new Set(["sh", "bash", "zsh", "ksh"]);

const extensionTypes: Record<string, CodeFileType> = {
  py: "python",
  java: "java",
  c: "c",
  h: "c",
  cs: "csharp",
  go: "go",
  php: "php",
  rs: "rust",
  rb: "ruby",
  md: "markdown",
  mdx: "markdown",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  ini: "ini",
  env: "env",
};

const specialBasenameTypes: Record<string, CodeFileType> = {
  dockerfile: "dockerfile",
  ".env": "env",
  ".bashrc": "shell",
  ".bash_profile": "shell",
  ".zshrc": "shell",
  ".zprofile": "shell",
  ".kshrc": "shell",
  ".profile": "shell",
};

export const getCodeFileType = (path: string): CodeFileType => {
  const basename = path.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase();
  if (!basename) return "unsupported";

  const specialBasenameType =
    specialBasenameTypes[basename] ??
    (basename.startsWith(".env.") ? "env" : undefined);
  if (specialBasenameType) return specialBasenameType;

  const extension = basename.includes(".")
    ? basename.slice(basename.lastIndexOf(".") + 1)
    : "";
  if (typescriptExtensions.has(extension)) return "typescript";
  if (javascriptExtensions.has(extension)) return "javascript";
  if (cppExtensions.has(extension)) return "cpp";
  if (shellExtensions.has(extension)) return "shell";
  return extensionTypes[extension] ?? "unsupported";
};
