import {
  projectCommitDetailsSchema,
  type ProjectCommitDetailsParamsSchema,
} from "../actions/commit-details-schemas";
import { parseProjectDiffPatch } from "../lib/diff-patch";
import { projectCommitDetailsLimits } from "../constants";
import { SandboxFilesError } from "@/services/daytona/api";

export const validateProjectCommitDetails = (
  input: unknown,
  expected: Pick<ProjectCommitDetailsParamsSchema, "commitSha" | "source">,
) => {
  const data = projectCommitDetailsSchema.parse(input);
  if (
    data.commit.hash !== expected.commitSha ||
    data.source !== expected.source ||
    data.baseSha !== (data.commit.parentHashes[0] ?? null) ||
    data.commit.isMerge !== data.commit.parentHashes.length > 1
  ) {
    throw new Error("Inconsistent commit identity");
  }
  const paths = new Set<string>();
  const summary = {
    fileCount: data.files.length,
    additions: 0,
    deletions: 0,
    unavailableCount: 0,
  };
  for (const file of data.files) {
    if (paths.has(file.path)) throw new Error("Duplicate commit file");
    paths.add(file.path);
    if (
      (file.status === "renamed" || file.status === "copied") !==
      (file.originalPath !== null)
    )
      throw new Error("Invalid original path");
    if (file.diff.unavailableReason !== null) {
      summary.unavailableCount++;
      continue;
    }
    if (
      Buffer.byteLength(file.diff.patch) >
      projectCommitDetailsLimits.maxPatchBytes
    )
      throw new Error("Oversized patch");
    const patch = parseProjectDiffPatch(file.diff.patch);
    if (
      !patch ||
      patch.additions !== file.diff.additions ||
      patch.deletions !== file.diff.deletions
    )
      throw new Error("Invalid commit patch");
    summary.additions += patch.additions;
    summary.deletions += patch.deletions;
  }
  for (const key of [
    "fileCount",
    "additions",
    "deletions",
    "unavailableCount",
  ] as const) {
    if (data.summary[key] !== summary[key])
      throw new Error("Inconsistent commit totals");
  }
  if (data.githubUrl) {
    const url = new URL(data.githubUrl);
    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !new RegExp("^/[^/]+/[^/]+/commit/" + expected.commitSha + "$").test(
        url.pathname,
      )
    )
      throw new Error("Invalid commit URL");
  }
  if (
    Buffer.byteLength(JSON.stringify(data)) >
    projectCommitDetailsLimits.maxResponseBytes
  ) {
    throw new SandboxFilesError(
      413,
      "COMMIT_DIFF_TOO_LARGE",
      "This commit is too large to load in one response.",
    );
  }
  return data;
};
