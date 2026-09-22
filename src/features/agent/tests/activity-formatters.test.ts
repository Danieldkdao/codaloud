import { expect, it } from "vitest";
import { formatTaskActivity } from "../lib/formatters";

it("combines lifecycle pairs without removing repeated operations or informational entries", () => {
  const rows = formatTaskActivity([
    "Working on your request",
    "Running: Check Git status",
    "Completed Check Git status",
    "Running: Check Git status",
    "Completed Check Git status",
    "Running: Read branches",
    "Keep the app open",
  ]);
  expect(rows.map(({ label }) => label)).toEqual([
    "Working on your request",
    "Check Git status",
    "Check Git status",
    "Read branches",
    "Keep the app open",
  ]);
  expect(rows[1]).toMatchObject({ state: "completed", icon: "git-commit" });
  expect(rows[3]).toMatchObject({ state: "running", icon: "git-branch" });
});
it("handles web tools and snapshots whose initial entry is missing", () => {
  expect(
    formatTaskActivity([
      "Completed Read file",
      "Searching the web",
      "Web search completed",
      "Reading a web page",
      "Page read completed",
    ]),
  ).toMatchObject([
    { label: "Read file", state: "completed", icon: "file-text" },
    { label: "Search the web", state: "completed", icon: "search" },
    { label: "Read web page", state: "completed", icon: "globe" },
  ]);
});
