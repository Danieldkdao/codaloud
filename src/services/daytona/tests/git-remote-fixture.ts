import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitFixture } from "./git-fixture";

export const createGitRemoteFixture = () => {
  const fixture = createGitFixture();
  const remotePath = mkdtempSync(join(tmpdir(), "codaloud-remote-"));
  execFileSync("git", ["init", "--bare", "-b", "main", remotePath], { stdio: "pipe" });
  fixture.git("push", remotePath, "main");
  fixture.git("remote", "add", "origin", "https://github.com/example/repo.git");
  fixture.git("config", "branch.main.remote", "origin");
  fixture.git("config", "branch.main.merge", "refs/heads/main");
  const remoteGit = (...args: string[]) => execFileSync("git", ["--git-dir", remotePath, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  // Replace only the actual remote transport with a local bare repository. Git
  // still performs real ref updates, merges, rebases, and lease checks.
  const prefix = `
const cp = require("node:child_process");
const original = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  if (args.includes("https://github.com/example/repo.git")) {
    if (options.cwd === ${JSON.stringify(fixture.repositoryPath)} || !options.env.GIT_CONFIG_VALUE_0?.includes("Authorization: Basic ")) throw new Error("Credential isolation failed");
    if (Object.keys(options.env).some((key) => key.startsWith("CODALOUD_"))) throw new Error("Input credential chunks leaked");
    args = ["-c", "protocol.file.allow=always", ...args.map((arg) => arg === "https://github.com/example/repo.git" ? ${JSON.stringify(remotePath)} : arg)];
  } else if (options.env.GIT_CONFIG_VALUE_0) throw new Error("Credentials leaked to local Git");
  return original(file, args, options);
};
`;
  const run = (script: string, input: Record<string, unknown> = {}) => fixture.run(script, {
    remote: { cloneUrl: "https://github.com/example/repo.git", accessToken: "test-secret" }, ...input,
  }, prefix);
  return { ...fixture, remotePath, remoteGit, run, cleanup: () => { fixture.cleanup(); rmSync(remotePath, { recursive: true, force: true }); } };
};
