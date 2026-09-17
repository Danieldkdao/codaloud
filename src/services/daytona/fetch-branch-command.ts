import { sandboxGitLockRuntime } from "./git-lock-command";
import { sandboxGitOriginRuntime } from "./git-origin-command";
import { sandboxCommandInput } from "./create-command";

// Runs inside Daytona. Network credentials are confined to an isolated Git
// repository so workspace Git configuration cannot redirect or intercept them.
export const sandboxFetchBranchCommand = sandboxCommandInput + sandboxGitLockRuntime + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
let temporary;
try {
  withGitOperationLock(input.repositoryPath, () => {
  const workspace = input.repositoryPath;
  for (const directory of [workspace, path.join(workspace, ".git")]) {
    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("WORKSPACE_REMOTE_MISMATCH");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith("GIT_") && !key.startsWith("CODALOUD_") && !/^(?:https?|all)_proxy$/i.test(key)));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" });
  const config = ["-c", "core.hooksPath=/dev/null", "-c", "gc.auto=0", "-c", "maintenance.auto=false",
    "-c", "credential.helper=", "-c", "protocol.allow=never"];
  const git = (args, cwd = workspace, extraEnv = {}) => execFileSync("git", [...config, ...args], {
    cwd, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 40000, maxBuffer: 1024 * 1024, stdio: "pipe",
  }).trim();
` + sandboxGitOriginRuntime + String.raw`
  git(["check-ref-format", "--branch", input.branchName]);
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(input.cloneUrl)) fail("WORKSPACE_REMOTE_MISMATCH");
  reconcileGitOrigin(input.cloneUrl, input.repositoryId, "WORKSPACE_REMOTE_MISMATCH");
  const localRef = "refs/heads/" + input.branchName;
  const remoteRef = "refs/remotes/origin/" + input.branchName;
  const localExists = () => {
    try { git(["show-ref", "--verify", "--quiet", localRef]); return true; }
    catch (error) { if (error.status === 1) return false; throw error; }
  };
  if (!localExists()) {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "codaloud-fetch-"));
    git(["init", "--bare", "--template=", temporary], temporary);
    try {
      git(["-c", "protocol.https.allow=always", "-c", "http.followRedirects=false", "-c", "http.sslVerify=true",
        "fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", input.cloneUrl,
        "refs/heads/" + input.branchName + ":refs/heads/codaloud-fetch"], temporary, {
          GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraHeader",
          GIT_CONFIG_VALUE_0: "Authorization: Basic " + Buffer.from("x-access-token:" + input.accessToken).toString("base64"),
        });
    } catch (error) {
      const reason = String(error.stderr || "").toLowerCase();
      if (/couldn't find remote ref|remote branch .*not found/.test(reason)) fail("REMOTE_BRANCH_NOT_FOUND");
      if (/authentication failed|could not read username|403|401|repository not found/.test(reason)) fail("REMOTE_FETCH_AUTH_FAILED");
      fail("REMOTE_FETCH_FAILED");
    }
    const sha = git(["rev-parse", "refs/heads/codaloud-fetch^{commit}"], temporary);
    if (!/^[a-f0-9]{40,64}$/.test(sha)) fail("REMOTE_FETCH_FAILED");
    // Import objects without network credentials. Do not update any local branch.
    git(["-c", "protocol.file.allow=always", "fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", temporary, sha]);
    git(["update-ref", remoteRef, sha]);
    // Compare-and-create protects a branch created concurrently; never reset it.
    try { git(["update-ref", localRef, sha, "0".repeat(sha.length)]); }
    catch (error) { if (!localExists()) throw error; }
    // Single-branch clones need an explicit fetch mapping for this new upstream.
    git(["config", "--add", "remote.origin.fetch", "+refs/heads/" + input.branchName + ":" + remoteRef]);
    git(["config", "branch." + input.branchName + ".remote", "origin"]);
    git(["config", "branch." + input.branchName + ".merge", "refs/heads/" + input.branchName]);
  }
  process.stdout.write(JSON.stringify({ branchName: input.branchName }));
  });
} catch (error) {
  const known = ["GIT_BUSY", "REMOTE_BRANCH_NOT_FOUND", "REMOTE_FETCH_AUTH_FAILED", "REMOTE_FETCH_FAILED", "WORKSPACE_REMOTE_MISMATCH"];
  process.stdout.write(JSON.stringify({ code: known.includes(error.code) ? error.code : "REMOTE_FETCH_FAILED" }));
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
`;
