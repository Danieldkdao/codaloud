import { sandboxCommandInput } from "./create-command";

// This program executes inside the sandbox; client strings travel as encoded data.
export const sandboxCommitsCommand = sandboxCommandInput + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const run = () => {
  const empty = () => process.stdout.write(JSON.stringify({ snapshotSha: null, isShallow: false, commits: [], hasNextPage: false }));
  const workspace = path.join(input.home, ".codaloud", "workspace");
  for (const directory of [path.join(input.home, ".codaloud"), workspace]) {
    const info = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!info) {
      if (input.allowEmptyRepository && !input.snapshotSha) return empty();
      fail("WORKSPACE_UNAVAILABLE");
    }
    if (!info.isDirectory() || info.isSymbolicLink()) fail("WORKSPACE_UNAVAILABLE");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
  const git = (args) => execFileSync("git", ["--no-pager", "--no-replace-objects", ...args], {
    cwd: workspace, env, encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (!fs.existsSync(path.join(workspace, ".git"))) {
    if (!input.allowEmptyRepository || input.snapshotSha) fail("WORKSPACE_UNAVAILABLE");
    empty();
  } else {
    if (fs.realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== fs.realpathSync(workspace)) fail("WORKSPACE_UNAVAILABLE");
    try { git(["check-ref-format", "--branch", input.branch]); } catch { fail("BRANCH_NOT_FOUND"); }
    const ref = "refs/heads/" + input.branch;
    let tip;
    try { tip = git(["rev-parse", "--verify", "--end-of-options", ref + "^{commit}"]).trim(); }
    catch {
      let head = "";
      try { head = git(["symbolic-ref", "-q", "HEAD"]).trim(); } catch {}
      if (head === ref && !input.snapshotSha) {
        empty();
      } else fail("BRANCH_NOT_FOUND");
    }
    if (tip) {
      const snapshotSha = input.snapshotSha || tip;
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshotSha)) fail("HISTORY_SNAPSHOT_UNAVAILABLE");
      try { git(["cat-file", "-e", snapshotSha + "^{commit}"]); } catch { fail("HISTORY_SNAPSHOT_UNAVAILABLE"); }
      const isShallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
      const commits = [];
      let hasNextPage = false;
      if (input.page !== undefined) {
        const skip = (input.page - 1) * input.pageSize;
        const output = git(["log", "--encoding=UTF-8", "--no-show-signature", "--no-decorate", "--no-color", "--topo-order", "-z",
          "--format=%H%x00%an%x00%ae%x00%cI%x00%P%x00%B", "--skip=" + skip,
          "--max-count=" + (input.pageSize + 1), snapshotSha, "--"]);
        const fields = output.split("\0");
        if (fields.at(-1) === "") fields.pop();
        if (fields.length % 6 !== 0) fail("COMMITS_UNAVAILABLE");
        for (let index = 0; index < fields.length; index += 6) {
          const [hash, author, authorEmail, committedAt, parents, message] = fields.slice(index, index + 6);
          const parentHashes = parents ? parents.split(" ") : [];
          commits.push({ hash, author, authorEmail, committedAt, message, parentHashes, isMerge: parentHashes.length > 1 });
        }
        hasNextPage = commits.length > input.pageSize;
        commits.length = Math.min(commits.length, input.pageSize);
      }
      process.stdout.write(JSON.stringify({ snapshotSha, isShallow, commits, hasNextPage }));
    }
  }
};
try { run(); } catch (error) {
  const known = ["BRANCH_NOT_FOUND", "HISTORY_SNAPSHOT_UNAVAILABLE", "WORKSPACE_UNAVAILABLE"];
  process.stdout.write(JSON.stringify({ code: known.includes(error.code) ? error.code : "COMMITS_UNAVAILABLE" }));
  process.exitCode = 1;
}
`;
