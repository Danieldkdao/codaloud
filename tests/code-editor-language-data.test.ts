import { LanguageDescription } from "@codemirror/language";
import { expect, it } from "vitest";
import { codeEditorLanguages } from "@/components/code-editor-language-data";

it.each([
  ["settings.jsonc", "JSON"],
  ["settings.json5", "JSON"],
  ["README.mdx", "Markdown"],
  [".env", "Environment"],
  [".env.local", "Environment"],
  [".zshrc", "Shell"],
  ["Dockerfile", "Dockerfile"],
  ["run.sh", "Shell"],
  ["settings.ini", "Properties files"],
] as const)("selects the %s highlighting mode", (filename, expectedName) => {
  expect(
    LanguageDescription.matchFilename(codeEditorLanguages, filename)?.name,
  ).toBe(expectedName);
});
