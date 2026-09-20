import { expect, it } from "vitest";
import { formatEditorText } from "../formatting";
import { defaultEditorPreferences } from "@/features/settings/constants";

it("expands compressed statements and respects the requested indentation", async () => {
  const result = await formatEditorText("main.ts", "function hello(){const a=1;const b=2;return a+b}", { ...defaultEditorPreferences, tabSize: 4 });
  expect(result?.formatted).toContain("\n    const a = 1;\n    const b = 2;");
});
it.each(["main.tsx", "main.jsx", "main.js"])("formats %s with JSX and expressions", async (path) => {
  expect((await formatEditorText(path, "const App=()=> <View foo={1+2}><Text>Hello</Text></View>", defaultEditorPreferences))?.formatted).toContain("foo={1 + 2}");
});
it("preserves CRLF, applies tabs and remains stable when repeated", async () => {
  const preferences = { ...defaultEditorPreferences, useTabs: true, tabSize: 4 };
  const first = await formatEditorText("main.ts", "function x(){\r\nreturn 1\r\n}", preferences);
  expect(first?.formatted).toContain("\r\n\treturn 1;");
  expect(await formatEditorText("main.ts", first!.formatted, preferences)).toEqual(first);
});
it.each([["style.css", "a{color:red;background:blue}"], ["data.json", '{"a":1,"b":2}'], ["page.html", "<div><p>Hello</p><p>World</p></div>"], ["data.yaml", "key:  [1,2]"]])("formats %s offline", async (path, text) => {
  expect((await formatEditorText(path, text, defaultEditorPreferences))?.formatted).not.toBe(text);
});
it("rejects invalid syntax and leaves unsupported languages to their language service", async () => {
  await expect(formatEditorText("main.ts", "const = ;", defaultEditorPreferences)).rejects.toThrow();
  expect(await formatEditorText("main.py", "x=1", defaultEditorPreferences)).toBeNull();
});
