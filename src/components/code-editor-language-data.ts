import {
  LanguageDescription,
  type LanguageDescription as LanguageDescriptionType,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";

const getLanguage = (name: string) =>
  LanguageDescription.matchLanguageName(languages, name);

const jsonLanguage = getLanguage("json");
const markdownLanguage = getLanguage("markdown");
const shellLanguage = getLanguage("shell");
const propertiesLanguage = getLanguage("properties");

const additionalLanguages = [
  jsonLanguage &&
    LanguageDescription.of({
      name: jsonLanguage.name,
      alias: jsonLanguage.alias,
      extensions: ["jsonc", "json5"],
      load: () => jsonLanguage.load(),
    }),
  markdownLanguage &&
    LanguageDescription.of({
      name: markdownLanguage.name,
      alias: markdownLanguage.alias,
      extensions: ["mdx"],
      load: () => markdownLanguage.load(),
    }),
  shellLanguage &&
    LanguageDescription.of({
      name: shellLanguage.name,
      alias: shellLanguage.alias,
      filename: /^\.(?:bashrc|bash_profile|zshrc|zprofile|kshrc|profile)$/i,
      load: () => shellLanguage.load(),
    }),
  propertiesLanguage &&
    LanguageDescription.of({
      name: "Environment",
      alias: ["dotenv"],
      filename: /^\.env(?:\..+)?$/i,
      load: () => propertiesLanguage.load(),
    }),
].filter((description): description is LanguageDescriptionType =>
  Boolean(description),
);

export const codeEditorLanguages: readonly LanguageDescriptionType[] = [
  ...languages,
  ...additionalLanguages,
];
