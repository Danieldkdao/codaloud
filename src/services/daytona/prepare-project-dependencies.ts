import type { Sandbox } from "@daytona/sdk";

// Run during the durable import operation, before the project becomes ready.
// Package declarations (including devDependencies) are required for TypeScript
// completion. Lifecycle scripts are unnecessary for this editor setup step.
const prepareDependenciesCommand = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
try {
  const home = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));
  const root = path.join(home, ".codaloud", "workspace");
  for (const folder of [path.join(home, ".codaloud"), root, path.join(root, ".git")]) {
    const stat = fs.lstatSync(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid workspace");
  }
  const read = (name) => {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) return "";
    if (!fs.lstatSync(file).isFile()) throw new Error("Invalid manifest");
    return fs.readFileSync(file, "utf8");
  };
  const manifest = read("package.json");
  if (!manifest) process.exit(0);
  const pkg = JSON.parse(manifest);
  const lockfiles = ["pnpm-lock.yaml", "npm-shrinkwrap.json", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"];
  const fingerprint = createHash("sha256").update(JSON.stringify([
    "editor-dependencies-v1", manifest, ...lockfiles.map(read), read(".npmrc"), read(".yarnrc.yml"),
  ])).digest("hex");
  const marker = path.join(root, ".git", "codaloud-dependencies.json");
  try {
    if (JSON.parse(read(".git/codaloud-dependencies.json")).fingerprint === fingerprint &&
        fs.statSync(path.join(root, "node_modules")).isDirectory()) process.exit(0);
  } catch {}
  const declared = pkg.packageManager;
  if (declared && !/^(npm|pnpm|yarn|bun)@\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(declared)) throw new Error("Unsupported package manager");
  const manager = declared?.split("@")[0] || (
    read("pnpm-lock.yaml") ? "pnpm" : read("yarn.lock") ? "yarn" :
    (read("bun.lock") || read("bun.lockb")) ? "bun" : "npm"
  );
  let executable;
  let args;
  switch (manager) {
    case "pnpm":
      executable = "corepack";
      args = [declared || "pnpm@10.30.3", "install", read("pnpm-lock.yaml") ? "--frozen-lockfile" : "--lockfile=false", "--ignore-scripts", "--prod=false"];
      break;
    case "yarn": {
      const modern = declared ? Number(declared.split("@")[1].split(".")[0]) >= 2 : read("yarn.lock").includes("__metadata:");
      executable = "corepack";
      args = [declared || (modern ? "yarn@4.9.4" : "yarn@1.22.22"), "install",
        ...(modern ? ["--immutable"] : ["--frozen-lockfile", "--ignore-scripts", "--production=false"])];
      break;
    }
    case "bun":
      executable = "bun";
      args = ["install", "--ignore-scripts", ...((read("bun.lock") || read("bun.lockb")) ? ["--frozen-lockfile"] : ["--no-save"])];
      break;
    default:
      executable = "npm";
      args = [(read("package-lock.json") || read("npm-shrinkwrap.json")) ? "ci" : "install", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund", "--package-lock=false"];
  }
  execFileSync(executable, args, {
    cwd: root, timeout: 480000, stdio: "ignore",
    // TypeScript's filesystem host needs materialized declarations, not Yarn PnP.
    env: { ...process.env, NODE_ENV: "development", CI: "true", COREPACK_ENABLE_AUTO_PIN: "0", YARN_ENABLE_SCRIPTS: "false", YARN_NODE_LINKER: "node-modules" },
  });
  fs.writeFileSync(marker, JSON.stringify({ fingerprint }), { mode: 0o600 });
} catch {
  process.exitCode = 1;
}
`;

export const prepareProjectDependencies = async (sandbox: Sandbox) => {
  try {
    const home = await sandbox.getUserHomeDir();
    if (!home?.startsWith("/")) throw new Error("Missing sandbox home");
    const payload = Buffer.from(JSON.stringify(home)).toString("base64");
    const response = await sandbox.process.executeCommand(
      `node -e '${prepareDependenciesCommand.replace(/'/g, "'\\''")}' '${payload}'`,
      undefined, undefined, 500,
    );
    if (response.exitCode !== 0) throw new Error("Dependency setup failed");
  } catch {
    // Package-manager errors may contain registry credentials or private URLs.
    throw new Error("Unable to prepare project dependencies. Please retry the project import.");
  }
};
