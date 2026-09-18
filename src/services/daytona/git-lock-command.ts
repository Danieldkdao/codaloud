// All application writers use this repository-scoped lock. Unlike an index
// lock, it can remain held while Git itself creates/replaces its native locks.
export const sandboxGitLockRuntime = String.raw`
const withGitOperationLock = (repositoryPath, run, busyCode = "GIT_BUSY") => {
  const lockFs = require("node:fs");
  const lockPath = require("node:path").join(repositoryPath, ".git", "codaloud-operation.lock");
  const directory = lockFs.lstatSync(require("node:path").dirname(lockPath), { throwIfNoEntry: false });
  // Existing file APIs also support workspaces without initialized Git. Their
  // own path checks handle unsupported metadata; Git routes reject it as well.
  if (!directory?.isDirectory() || directory.isSymbolicLink()) return run();
  let fd;
  try { fd = lockFs.openSync(lockPath, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") error.code = busyCode; throw error; }
  const owned = lockFs.fstatSync(fd);
  try { return run(); }
  finally {
    lockFs.closeSync(fd);
    const current = lockFs.lstatSync(lockPath, { throwIfNoEntry: false });
    if (current?.ino === owned.ino && current?.dev === owned.dev) lockFs.rmSync(lockPath);
  }
};
`;
