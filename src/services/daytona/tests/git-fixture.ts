import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandboxCommand } from "../create-command";

export const createGitFixture = () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "codaloud-git-api-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repositoryPath, encoding: "utf8", stdio: "pipe" }).trim();
  const write = (name: string, content: string) => writeFileSync(join(repositoryPath, name), content);
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  write("file.txt", "base\n");
  git("add", ".");
  git("commit", "-m", "Initial");
  const headSha = git("rev-parse", "HEAD");
  const run = (script: string, input: Record<string, unknown> = {}, prefix = "") => {
    const command = createSandboxCommand(prefix + script, {
      repositoryPath,
      author: { name: "Ada", email: "ada@example.com" }, ...input,
    }, 90);
    const result = spawnSync("sh", ["-c", command.command], {
      env: { ...process.env, ...command.envs }, encoding: "utf8", timeout: 95_000, maxBuffer: 8 * 1024 * 1024,
    });
    if (!result.stdout) throw new Error(result.stderr || String(result.error));
    const output = JSON.parse(result.stdout);
    if (result.status !== 0) throw { ...output, stderr: result.stderr };
    return output;
  };
  return { repositoryPath, git, write, headSha, run, cleanup: () => rmSync(repositoryPath, { recursive: true, force: true }) };
};
