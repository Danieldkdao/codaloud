import { readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitFetchCommand } from "../git-fetch-command";
import { sandboxGitPullCommand } from "../git-pull-command";
import { sandboxGitPushCommand } from "../git-push-command";
import { createGitRemoteFixture } from "./git-remote-fixture";

let fixture: ReturnType<typeof createGitRemoteFixture>;
beforeEach(() => {
  fixture = createGitRemoteFixture();
});
afterEach(() => fixture.cleanup());

const operations = [
  { name: "fetch", script: sandboxGitFetchCommand, input: {} },
  { name: "pull", script: sandboxGitPullCommand, input: { rebase: false } },
  { name: "push", script: sandboxGitPushCommand, input: { force: false } },
];

for (const operation of operations) {
  it.each([
    "https://github.com/example/old-name.git",
    "https://github.com/previous-owner/repo.git",
  ])(`${operation.name}: reconciles a renamed or transferred import from %s`, (origin) => {
    fixture.git("remote", "set-url", "origin", origin);
    fixture.write(".git/codaloud-import.json", JSON.stringify({ repositoryId: "123" }));
    fixture.git("commit", "--allow-empty", "-m", "Remote change");
    const tip = fixture.git("rev-parse", "HEAD");
    if (operation.name !== "push") {
      fixture.git("push", fixture.remotePath, "main");
      fixture.git("reset", "--hard", fixture.headSha);
    }

    fixture.run(operation.script, operation.input);

    expect(fixture.git("config", "--get-all", "remote.origin.url")).toBe("https://github.com/example/repo.git");
    expect(fixture.git("rev-parse", "refs/remotes/origin/main")).toBe(tip);
    expect(fixture.remoteGit("rev-parse", "main")).toBe(tip);
    expect(fixture.git("rev-parse", "HEAD")).toBe(operation.name === "fetch" ? fixture.headSha : tip);
    expect(readFileSync(join(fixture.repositoryPath, ".git/config"), "utf8")).not.toContain("test-secret");
  });
}

it.each(["missing", "different repository", "malformed", "symlink"])(
  "rejects a changed origin with a %s import marker before network access",
  (scenario) => {
    const origin = "https://github.com/other/repo.git";
    fixture.git("remote", "set-url", "origin", origin);
    if (scenario === "different repository") {
      fixture.write(".git/codaloud-import.json", JSON.stringify({ repositoryId: "456" }));
    } else if (scenario === "malformed") {
      fixture.write(".git/codaloud-import.json", "invalid json");
    } else if (scenario === "symlink") {
      fixture.write("marker.json", JSON.stringify({ repositoryId: "123" }));
      symlinkSync(join(fixture.repositoryPath, "marker.json"), join(fixture.repositoryPath, ".git/codaloud-import.json"));
    }
    const hook = `
const execute = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  if (options.env.GIT_CONFIG_VALUE_0) throw new Error("Unexpected authenticated transport");
  return execute(file, args, options);
};`;
    expect(() => fixture.run(sandboxGitFetchCommand, {}, hook)).toThrow(expect.objectContaining({ code: "GIT_REMOTE_MISMATCH" }));
    expect(fixture.git("config", "remote.origin.url")).toBe(origin);
  },
);

it("does not send credentials through workspace URL rewriting after a rename", () => {
  fixture.git("remote", "set-url", "origin", "https://github.com/example/old-name.git");
  fixture.write(".git/codaloud-import.json", JSON.stringify({ repositoryId: "123" }));
  fixture.git("config", "url.https://untrusted.invalid/.insteadOf", "https://github.com/");
  fixture.run(sandboxGitFetchCommand);
  expect(fixture.git("rev-parse", "refs/remotes/origin/main")).toBe(fixture.headSha);
});
