import type { Sandbox } from "@daytona/sdk";

// Only pass an import source validated on the server. Never persist the token.
type GitHubCloneInput = {
  operationId: string;
  repositoryId: string;
  branchName: string;
  cloneUrl: string;
  accessToken: string;
};

// Runs inside Daytona. The per-project task queue serializes workspace publication.
// A unique staging directory isolates incomplete or still-running clone attempts.
const prepareImportCommand = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const input = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));
const directory = (target) => {
  const info = fs.lstatSync(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Invalid directory");
};
const home = fs.realpathSync(input.home);
const base = path.join(home, ".codaloud");
if (!fs.existsSync(base)) fs.mkdirSync(base, { mode: 0o755 });
directory(base);
const root = path.join(base, "workspace");
const markerName = "codaloud-import.json";
const matches = (marker) => marker.operationId === input.operationId &&
  marker.repositoryId === input.repositoryId && marker.branchName === input.branchName;
if (fs.existsSync(root)) {
  directory(root);
  directory(path.join(root, ".git"));
  const marker = JSON.parse(fs.readFileSync(path.join(root, ".git", markerName), "utf8"));
  if (!matches(marker)) throw new Error("Existing workspace belongs to another import");
  process.stdout.write(JSON.stringify({ completed: true }));
} else if (input.stagingPath) {
  const stagingParent = path.dirname(input.stagingPath);
  if (path.dirname(stagingParent) !== base || !path.basename(stagingParent).startsWith("import-") ||
      path.basename(input.stagingPath) !== "repository") throw new Error("Invalid staging directory");
  directory(stagingParent);
  directory(input.stagingPath);
  directory(path.join(input.stagingPath, ".git"));
  fs.writeFileSync(path.join(input.stagingPath, ".git", markerName), JSON.stringify({
    operationId: input.operationId, repositoryId: input.repositoryId, branchName: input.branchName,
  }), { flag: "wx", mode: 0o600 });
  // Rename publishes the repository and its completion marker together.
  fs.renameSync(input.stagingPath, root);
  fs.rmdirSync(stagingParent);
  process.stdout.write(JSON.stringify({ completed: true }));
} else {
  const stagingParent = fs.mkdtempSync(path.join(base, "import-"));
  process.stdout.write(JSON.stringify({ completed: false, stagingPath: path.join(stagingParent, "repository") }));
}
`;

export const cloneGitHubRepository = async (sandbox: Sandbox, input: GitHubCloneInput) => {
  try {
    const home = await sandbox.getUserHomeDir();
    if (!home?.startsWith("/")) throw new Error("Missing sandbox home");
    const prepare = async (stagingPath?: string) => {
      const payload = Buffer.from(JSON.stringify({
        home, operationId: input.operationId, repositoryId: input.repositoryId,
        branchName: input.branchName, stagingPath,
      })).toString("base64");
      const command = `node -e '${prepareImportCommand.replace(/'/g, "'\\''")}' '${payload}'`;
      const response = await sandbox.process.executeCommand(command, undefined, undefined, 10);
      if (response.exitCode !== 0) throw new Error("Workspace preparation failed");
      return JSON.parse(response.result) as { completed: boolean; stagingPath?: string };
    };
    const prepared = await prepare();
    if (prepared.completed) return;
    if (!prepared.stagingPath) throw new Error("Missing clone destination");

    // Pass credentials in dedicated SDK fields, never the URL or a shell command.
    await sandbox.git.clone(
      input.cloneUrl, prepared.stagingPath, input.branchName, undefined,
      "x-access-token", input.accessToken,
    );
    await prepare(prepared.stagingPath);
  } catch {
    // SDK errors can include the authenticated request body. Do not retain a cause.
    throw new Error("Unable to import the GitHub repository. Existing workspace files have been preserved.");
  }
};
