import { expect, it } from "vitest";
import { terminalCardBackground } from "../lib/colors";

it("matches a 70% card background over the panel background", () => {
  expect(terminalCardBackground("#ffffff", "#000000")).toBe("#b3b3b3");
  expect(terminalCardBackground("#eee", "#fff")).toBe("#f3f3f3");
});
