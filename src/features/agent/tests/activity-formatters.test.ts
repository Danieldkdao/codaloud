import { expect, it } from "vitest";
import {
  formatTaskActivity,
  formatTaskActivityStats,
  formatTaskActivityState,
  formatTaskActivityButton,
} from "../lib/formatters";

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

it("counts paired actions rather than log messages and excludes informational updates", () => {
  expect(
    formatTaskActivityStats([
      "Working on your request",
      "Running: Read file",
      "Completed Read file",
      "Running: Read file",
      "Searching the web",
      "Web search completed",
    ]),
  ).toEqual({ actions: "3 actions", completed: "2 completed" });
  expect(formatTaskActivityStats([])).toEqual({
    actions: "0 actions",
    completed: "0 completed",
  });
  expect(formatTaskActivityStats(["Completed Read file"])).toEqual({
    actions: "1 action",
    completed: "1 completed",
  });
});

it("does not describe unfinished operations as running after a terminal task status", () => {
  expect(formatTaskActivityState("running", "failed")).toBe("Not completed");
  expect(formatTaskActivityState("running", "completed")).toBe(
    "No completion recorded",
  );
  expect(formatTaskActivityState("running", "waiting")).toBe("Running");
  expect(formatTaskActivityState("completed", "failed")).toBe("Completed");
  expect(formatTaskActivityState("info", "running")).toBeNull();
  expect(formatTaskActivityButton("running")).toBe("View Agent Activity");
  expect(formatTaskActivityButton("failed")).toBe("View Full Activity");
  expect(formatTaskActivityButton("completed")).toBe("View Full Activity");
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
