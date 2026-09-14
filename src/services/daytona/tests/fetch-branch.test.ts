import { afterEach, beforeEach, expect, it } from "vitest";
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { sandboxFetchBranchCommand } from "../fetch-branch-command";
import { createSandboxCommand } from "../create-command";

const require = createRequire(import.meta.url);
const cloneUrl = "https://github.com/owner/repo.git";
let root: string;
let remote: string;
let workspace: string;
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codaloud-fetch-test-"));
  remote = join(root, "source"); workspace = join(root, "workspace");
  mkdirSync(remote);
  git(remote, "init", "-b", "main");
  git(remote, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Initial");
  git(root, "clone", "--single-branch", "--branch", "main", remote, workspace);
  git(workspace, "remote", "set-url", "origin", cloneUrl);
  git(remote, "checkout", "-b", "feature/remote");
  writeFileSync(join(remote, "new.txt"), "remote content");
  git(remote, "add", ".");
  git(remote, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Remote change");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (branchName = "feature/remote", failFetch = false) => {
  let output = "";
  const requests: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const input = { repositoryPath: workspace, repositoryId: "123", cloneUrl, branchName, accessToken: "private-test-token" };
  const sandboxProcess = { env: { ...process.env, ...createSandboxCommand("", input, 50).envs }, stdout: { write: (value: string) => { output += value; } }, exitCode: 0 };
  const sandboxRequire = (name: string) => name === "node:child_process" ? {
    execFileSync: (command: string, args: string[], options: ExecFileSyncOptionsWithStringEncoding & { env: NodeJS.ProcessEnv }) => {
      if (args.includes(cloneUrl)) {
        requests.push({ args, env: options.env });
        if (failFetch) throw Object.assign(new Error("private-test-token"), { stderr: Buffer.from("Authentication failed: private-test-token") });
        // Exercise real Git with a local fixture in place of the authenticated network.
        return execFileSync(command, ["-c", "protocol.file.allow=always", ...args.map((arg) => arg === cloneUrl ? remote : arg)], options);
      }
      return execFileSync(command, args, options);
    },
  } : require(name);
  new Function("require", "process", sandboxFetchBranchCommand)(sandboxRequire, sandboxProcess);
  return { result: JSON.parse(output), requests, exitCode: sandboxProcess.exitCode };
};

it("fetches a missing branch from a single-branch import without touching HEAD, edits, or the index", () => {
  writeFileSync(join(workspace, "draft.txt"), "keep my work");
  git(workspace, "add", "draft.txt");
  const head = git(workspace, "rev-parse", "HEAD");
  const index = readFileSync(join(workspace, ".git/index"));
  const result = run();
  expect(result.result).toEqual({ branchName: "feature/remote" });
  expect(git(workspace, "rev-parse", "feature/remote")).toBe(git(remote, "rev-parse", "feature/remote"));
  expect(git(workspace, "rev-parse", "feature/remote@{upstream}")).toBe(git(remote, "rev-parse", "feature/remote"));
  expect(git(workspace, "rev-parse", "HEAD")).toBe(head);
  expect(readFileSync(join(workspace, ".git/index"))).toEqual(index);
  expect(readFileSync(join(workspace, "draft.txt"), "utf8")).toBe("keep my work");
  expect(readFileSync(join(workspace, ".git/config"), "utf8")).not.toContain("private-test-token");
  expect(result.requests[0].args).not.toContain("private-test-token");
  expect(result.requests[0].env.GIT_CONFIG_VALUE_0).toContain("Authorization: Basic ");
});

it("preserves existing local commits and skips fetching that branch", () => {
  git(workspace, "branch", "feature/remote");
  const head = git(workspace, "rev-parse", "feature/remote");
  expect(run().requests).toHaveLength(0);
  expect(git(workspace, "rev-parse", "feature/remote")).toBe(head);
});

it("refuses a workspace whose origin points to a different repository", () => {
  git(workspace, "remote", "set-url", "origin", "https://github.com/other/repo.git");
  const result = run();
  expect(result.result.code).toBe("WORKSPACE_REMOTE_MISMATCH");
  expect(result.requests).toHaveLength(0);
});

it("does not expose credentials or create a local branch after a failed fetch", () => {
  const result = run("feature/remote", true);
  expect(result.result.code).toBe("REMOTE_FETCH_AUTH_FAILED");
  expect(JSON.stringify(result.result)).not.toContain("private-test-token");
  expect(git(workspace, "branch", "--list", "feature/remote")).toBe("");
});

it("treats shell metacharacters as branch-name data", () => {
  const name = "feature/quote'$(touch-pwn)";
  git(remote, "branch", name);
  expect(run(name).result).toEqual({ branchName: name });
  expect(git(workspace, "rev-parse", `refs/heads/${name}`)).toBe(git(remote, "rev-parse", "HEAD"));
});

it("does not let workspace URL rewriting affect the authenticated fetch", () => {
  git(workspace, "config", "url.https://elsewhere.example/.insteadOf", "https://github.com/");
  expect(run().result).toEqual({ branchName: "feature/remote" });
});

it("leaves conflicting untracked files intact for normal checkout to reject", () => {
  writeFileSync(join(workspace, "new.txt"), "local draft");
  expect(run().result).toEqual({ branchName: "feature/remote" });
  expect(() => git(workspace, "checkout", "feature/remote")).toThrow(/would be overwritten/);
  expect(readFileSync(join(workspace, "new.txt"), "utf8")).toBe("local draft");
  expect(git(workspace, "branch", "--show-current")).toBe("main");
});
