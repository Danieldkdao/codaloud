import { InvalidToolInputError } from "ai";
import { expect, it } from "vitest";
import { describeToolError } from "../lib/tool-error-recovery";

const schemaRejection = (toolName: string) =>
  new InvalidToolInputError({
    toolName,
    toolInput: "value: {}",
    cause: new Error("Type validation failed"),
  });

it("treats a schema rejection as correctable so the model can retry", () => {
  const outcome = describeToolError("saveFile", schemaRejection("saveFile"));
  expect(outcome.recoverable).toBe(true);
  expect(outcome.message).toContain("saveFile");
  expect(outcome.message).toMatch(/correct the arguments and call it again/i);
});

it("keeps an execution failure fatal so a mutation is never retried", () => {
  const outcome = describeToolError("saveFile", new Error("device offline"));
  expect(outcome.recoverable).toBe(false);
  expect(outcome.message).toContain("saveFile");
  expect(outcome.message).toMatch(/before trying again/i);
});

it("keeps a non-error value fatal rather than assuming it is recoverable", () => {
  expect(describeToolError("editFile", undefined).recoverable).toBe(false);
  expect(describeToolError("editFile", "boom").recoverable).toBe(false);
});
