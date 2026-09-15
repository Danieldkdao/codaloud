import { afterEach, beforeEach, expect, it } from "vitest";
import { sandboxGitCheckoutCommand } from "../git-checkout-command";
import { createGitFixture } from "./git-fixture";
let fixture: ReturnType<typeof createGitFixture>;
beforeEach(() => { fixture = createGitFixture(); fixture.git("branch", "other"); });
afterEach(() => fixture.cleanup());
const run = () => fixture.run(sandboxGitCheckoutCommand, { branch: "other", previousBranch: "main" });
it("switches an existing branch and preserves nonconflicting dirty work", () => {
  fixture.write("file.txt", "keep\n"); expect(run()).toEqual({ checkedOut: true });
  expect(fixture.git("branch", "--show-current")).toBe("other"); expect(fixture.git("diff")).toContain("keep");
});
it("rejects checkout during another application Git operation", () => {
  fixture.write(".git/codaloud-operation.lock", "busy");
  expect(() => run()).toThrow(expect.objectContaining({ code: "GIT_BUSY" }));
  expect(fixture.git("branch", "--show-current")).toBe("main");
});
it("preserves Git's conflict explanation without forcing a checkout", () => {
  fixture.git("switch", "other"); fixture.write("file.txt", "other\n"); fixture.git("add", "."); fixture.git("commit", "-m", "Other"); fixture.git("switch", "main");
  fixture.write("file.txt", "keep\n");
  expect(run().error).toContain("would be overwritten");
  expect(fixture.git("branch", "--show-current")).toBe("main");
});
