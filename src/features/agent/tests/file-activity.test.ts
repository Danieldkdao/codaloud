import { expect, it } from "vitest";
import { updateFileActivity } from "../file-activity";

it("keeps proposed and confirmed file changes distinct and deduplicates receipt replays", () => {
  const command = {
    id: "one",
    tokenId: "token",
    name: "saveFile",
    args: { path: "proposed.ts" },
    revision: "a".repeat(64),
  };
  const proposed = updateFileActivity([], command);
  expect(proposed).toEqual([{ path: "proposed.ts", status: "proposed" }]);
  const failed = updateFileActivity(proposed, command, {
    ok: false,
    text: "failed",
    truncated: false,
  });
  expect(failed).toEqual([{ path: "proposed.ts", status: "failed" }]);
  const output = {
    ok: true,
    text: "done",
    truncated: false,
    changedFiles: ["actual.ts"],
  };
  const changed = updateFileActivity(proposed, command, output);
  expect(changed.filter((file) => file.status === "changed")).toEqual([
    { path: "actual.ts", status: "changed" },
  ]);
  expect(updateFileActivity(changed, command, output)).toEqual(changed);
  expect(
    updateFileActivity(
      changed,
      { ...command, name: "readFile", args: { path: "actual.ts" } },
      { ok: true, text: "read", truncated: false },
    ),
  ).toEqual(changed);
});
