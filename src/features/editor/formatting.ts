import type { EditorPreferences } from "@/features/settings/types";

export const formatEditorText = async (
  path: string,
  content: string,
  preferences: EditorPreferences,
  cursorOffset = -1,
) => {
  const extension = path.split(".").at(-1)?.toLowerCase();
  let parser: string;
  const plugins: import("prettier").Plugin[] = [];
  switch (extension) {
    case "ts": case "tsx": case "mts": case "cts":
      parser = "typescript";
      plugins.push(await import("prettier/plugins/typescript"), await import("prettier/plugins/estree"));
      break;
    case "js": case "jsx": case "mjs": case "cjs": case "json": case "jsonc": case "json5":
      parser = extension.startsWith("json") ? extension === "jsonc" ? "json" : extension : "babel";
      plugins.push(await import("prettier/plugins/babel"), await import("prettier/plugins/estree"));
      break;
    case "css": case "scss": case "less":
      parser = extension;
      plugins.push(await import("prettier/plugins/postcss"));
      break;
    case "html": case "vue": case "angular":
      parser = extension;
      plugins.push(await import("prettier/plugins/html"));
      break;
    case "md": case "mdx":
      parser = extension === "md" ? "markdown" : "mdx";
      plugins.push(await import("prettier/plugins/markdown"));
      break;
    case "yaml": case "yml":
      parser = "yaml";
      plugins.push(await import("prettier/plugins/yaml"));
      break;
    case "graphql": case "gql":
      parser = "graphql";
      plugins.push(await import("prettier/plugins/graphql"));
      break;
    default: return null;
  }
  const { formatWithCursor } = await import("prettier/standalone");
  // Bundle parsers locally; project configuration/plugins are never executed.
  return formatWithCursor(content, {
    parser, plugins, filepath: path, cursorOffset,
    tabWidth: preferences.tabSize, useTabs: preferences.useTabs,
    printWidth: 80, endOfLine: content.includes("\r\n") ? "crlf" : "lf",
  });
};
