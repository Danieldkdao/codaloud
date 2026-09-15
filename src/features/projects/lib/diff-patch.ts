import type { ProjectDiffHunk, ProjectDiffLine, ProjectDiffPatch } from "../types";

const isProjectDiffMetadata = (line: string) =>
  /^(?:old mode|new mode|deleted file mode|new file mode) [0-7]{6}$/.test(line) ||
  /^index [a-f0-9]+\.\.[a-f0-9]+(?: [0-7]{6})?$/.test(line) ||
  /^(?:dis)?similarity index (?:100|[0-9]{1,2})%$/.test(line) ||
  /^(?:rename|copy) (?:from|to) .+$/.test(line) ||
  /^(?:---|\+\+\+) .+$/.test(line);

const createProjectDiffHunk = (header: string): ProjectDiffHunk | null => {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(header);
  if (!match) return null;
  const oldStart = Number(match[1]);
  const oldCount = Number(match[2] ?? 1);
  const newStart = Number(match[3]);
  const newCount = Number(match[4] ?? 1);
  if (
    ![oldStart, oldCount, newStart, newCount, oldStart + oldCount, newStart + newCount].every(Number.isSafeInteger) ||
    (oldCount > 0 && oldStart === 0) || (newCount > 0 && newStart === 0) ||
    (oldCount === 0 && newCount === 0)
  ) return null;
  return { header, oldStart, oldCount, newStart, newCount, lines: [], beforeText: "", afterText: "" };
};

const getProjectDiffHunkText = (lines: ProjectDiffLine[], side: "oldLine" | "newLine") =>
  lines.filter((line) => line[side] !== null)
    .map((line) => line.text + (line.noNewline ? "" : "\n")).join("");

/** Parses one complete two-way patch from the changes API, or returns null. */
export const parseProjectDiffPatch = (patch: string): ProjectDiffPatch | null => {
  const result: ProjectDiffPatch = { metadata: [], hunks: [], additions: 0, deletions: 0 };
  if (patch === "") return result;
  // Git terminates patch records with LF even when a source file lacks its final LF.
  if (!patch.endsWith("\n") || patch.includes("\0")) return null;
  const lines = patch.slice(0, -1).split("\n");
  let hunk: ProjectDiffHunk | null = null;
  let oldConsumed = 0;
  let newConsumed = 0;
  let oldEnd = 0;
  let newEnd = 0;
  let oldTerminated = false;
  let newTerminated = false;
  let previousLine: ProjectDiffLine | null = null;

  const finishHunk = () => {
    if (!hunk) return true;
    if (oldConsumed !== hunk.oldCount || newConsumed !== hunk.newCount) return false;
    hunk.beforeText = getProjectDiffHunkText(hunk.lines, "oldLine");
    hunk.afterText = getProjectDiffHunkText(hunk.lines, "newLine");
    return true;
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (!finishHunk()) return null;
      const next = createProjectDiffHunk(line);
      if (!next || oldTerminated || newTerminated) return null;
      // A zero-length range is anchored AFTER its line; other ranges are 1-based.
      const oldFrom = next.oldCount === 0 ? next.oldStart : next.oldStart - 1;
      const newFrom = next.newCount === 0 ? next.newStart : next.newStart - 1;
      if (oldFrom < oldEnd || newFrom < newEnd || oldFrom - oldEnd !== newFrom - newEnd) return null;
      oldEnd = oldFrom + next.oldCount;
      newEnd = newFrom + next.newCount;
      hunk = next;
      result.hunks.push(hunk);
      oldConsumed = 0;
      newConsumed = 0;
      previousLine = null;
      continue;
    }

    if (!hunk) {
      if (line.startsWith("diff --git ")) {
        // The API provides one patch per path/scope, never a multi-file document.
        if (result.metadata.length > 0 || line === "diff --git ") return null;
      } else if (!isProjectDiffMetadata(line)) return null;
      result.metadata.push(line);
      continue;
    }

    if (line === "\\ No newline at end of file") {
      if (!previousLine || previousLine.noNewline) return null;
      previousLine.noNewline = true;
      if (previousLine.oldLine !== null) oldTerminated = true;
      if (previousLine.newLine !== null) newTerminated = true;
      previousLine = null;
      continue;
    }

    let row: ProjectDiffLine;
    switch (line[0]) {
      case " ":
        if (oldTerminated || newTerminated) return null;
        row = { kind: "context", text: line.slice(1), oldLine: hunk.oldStart + oldConsumed++, newLine: hunk.newStart + newConsumed++, noNewline: false };
        break;
      case "-":
        if (oldTerminated) return null;
        row = { kind: "deletion", text: line.slice(1), oldLine: hunk.oldStart + oldConsumed++, newLine: null, noNewline: false };
        result.deletions++;
        break;
      case "+":
        if (newTerminated) return null;
        row = { kind: "addition", text: line.slice(1), oldLine: null, newLine: hunk.newStart + newConsumed++, noNewline: false };
        result.additions++;
        break;
      default:
        return null;
    }
    if (oldConsumed > hunk.oldCount || newConsumed > hunk.newCount) return null;
    hunk.lines.push(row);
    previousLine = row;
  }

  return finishHunk() ? result : null;
};
