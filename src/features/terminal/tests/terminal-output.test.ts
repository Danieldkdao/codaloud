import { expect, it } from "vitest";
import { appendTerminalOutput } from "../lib/terminal-output";

it("renders common PTY color, backspace, and carriage-return output", () => {
  expect(appendTerminalOutput("", "\x1b[32mp\bpython\x1b[0m\r\n123\r\n")).toBe(
    "python\n123\n",
  );
  expect(appendTerminalOutput("progress 10%", "\rcomplete")).toBe("complete");
});

it("bounds terminal history", () => {
  expect(appendTerminalOutput("x".repeat(100_000), "end")).toHaveLength(
    100_000,
  );
  expect(appendTerminalOutput("x".repeat(100_000), "end").endsWith("end")).toBe(
    true,
  );
});
