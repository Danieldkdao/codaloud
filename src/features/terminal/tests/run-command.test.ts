import { expect, it } from "vitest";
import { runCommandForFile } from "../lib/run-command";

it("runs supported JavaScript, TypeScript, and Python project files", () => {
  expect(runCommandForFile("src/main.js")).toBe("node 'src/main.js'");
  expect(runCommandForFile("src/main.ts")).toBe("npx --yes tsx 'src/main.ts'");
  expect(runCommandForFile("main.py")).toBe("python3 'main.py'");
  expect(runCommandForFile("src/it's.py")).toBe("python3 'src/it'\\''s.py'");
});

it("rejects unsupported files and unsafe paths", () => {
  expect(() => runCommandForFile("photo.png")).toThrow(
    /JavaScript, TypeScript, or Python/,
  );
  expect(() => runCommandForFile("../secret.py")).toThrow();
});
