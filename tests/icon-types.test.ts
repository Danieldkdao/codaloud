import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterAll, expect, it } from "vitest";

// Exercise the same completion service used by TypeScript editors, without loading native UI.
const fixturePath = resolve("tests/icon-type-fixture.tsx");
const configFile = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
let source = "";
let version = 0;
const service = ts.createLanguageService({
  ...ts.sys,
  useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  getCompilationSettings: () => config.options,
  getScriptFileNames: () => [fixturePath],
  getScriptVersion: (path) => path === fixturePath ? String(version) : "0",
  getScriptSnapshot: (path) => {
    const content = path === fixturePath ? source : ts.sys.readFile(path);
    return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
  },
  getCurrentDirectory: () => process.cwd(),
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  fileExists: (path) => path === fixturePath || ts.sys.fileExists(path),
});

const setSource = (body: string) => {
  source = `import { Icon, type IconProps } from "@/components/ui/icon";\n${body}`;
  version += 1;
};

const completeNames = (attributes: string) => {
  setSource(`export const Example = () => <Icon ${attributes} />;`);
  const position = source.indexOf('name=""') + 'name="'.length;
  return service.getCompletionsAtPosition(fixturePath, position, {})?.entries.map((entry) => entry.name) ?? [];
};

afterAll(() => service.dispose());

it.each([
  ["AntDesign", "AntDesign"],
  ["EvilIcons", "EvilIcons"],
  ["Feather", "Feather"],
  ["Ionicons", "Ionicons"],
  ["Entypo", "Entypo"],
  ["FontAwesome", "FontAwesome"],
  ["FontAwesome5", "FontAwesome5Free"],
  ["FontAwesome6", "FontAwesome6Free"],
  ["Fontisto", "Fontisto"],
  ["Foundation", "Foundation"],
  ["MaterialCommunityIcons", "MaterialCommunityIcons"],
  ["MaterialIcons", "MaterialIcons"],
  ["Octicons", "Octicons"],
  ["SimpleLineIcons", "SimpleLineIcons"],
  ["Zocial", "Zocial"],
])("suggests only %s glyphs regardless of JSX attribute order", (family, glyphMap) => {
  const glyphs = Object.keys(JSON.parse(readFileSync(resolve(
    `node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/${glyphMap}.json`,
  ), "utf8"))).sort();
  for (const attributes of [`family="${family}" name=""`, `name="" family="${family}"`]) {
    const names = completeNames(attributes).sort();
    expect(names).toHaveLength(glyphs.length);
    expect(names).toEqual(glyphs);
  }
});

it("keeps automatic family lookup when no family is supplied", () => {
  const names = completeNames('name=""');
  expect(names).toContain("dot-single");
  expect(names).toContain("git-branch");
  expect(names).toContain("ellipse");
});

it("accepts valid names and correlated prop spreads while rejecting mismatched families", () => {
  setSource(`
    import type { ComponentProps } from "react";
    export const Valid = () => <Icon family="Entypo" name="dot-single" className="text-foreground" />;
    export const Auto = () => <Icon name="dot-single" />;
    export const FontAwesome = () => <Icon family="FontAwesome6" name="circle" solid />;
    export const Wrapped = (props: IconProps) => <Icon {...props} size={20} />;
    export const InferredWrapper = (props: ComponentProps<typeof Icon>) => <Icon {...props} />;
    export const FeatherWrapper = (props: IconProps<"Feather">) => <Icon {...props} />;
    declare const choice: { family: "Feather"; name: "git-branch" } | { family: "Ionicons"; name: "ellipse" };
    export const Correlated = () => <Icon {...choice} />;
    // @ts-expect-error A name from Entypo must not widen Feather to another family.
    export const Invalid = () => <Icon family="Feather" name="dot-single" />;
    // @ts-expect-error Font Awesome's upstream any type must not allow arbitrary names.
    export const InvalidFontAwesome = () => <Icon family="FontAwesome6" name="not-an-icon" />;
    // @ts-expect-error Unknown names must also fail automatic lookup.
    export const InvalidAuto = () => <Icon name="not-an-icon" />;
    declare const unrelatedFamily: "Feather" | "Ionicons";
    // @ts-expect-error This could select Feather, which has no ellipse glyph.
    export const Uncorrelated = () => <Icon family={unrelatedFamily} name="ellipse" />;
  `);
  const diagnostics = service.getSemanticDiagnostics(fixturePath);
  expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
});
