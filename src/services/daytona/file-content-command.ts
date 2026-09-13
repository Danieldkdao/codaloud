// Shared sandbox-only code for bounded reads anchored to open Linux directories.
// The caller supplies fs, fail, and validateName; callbacks never resolve an unchecked path.
export const sandboxFileContentCommand = String.raw`
const readContent = (target, options) => {
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!existing) fail("FILE_NOT_FOUND");
  if (existing.isSymbolicLink()) fail("INVALID_PATH");
  if (!existing.isFile()) fail("NOT_A_FILE");
  // Reject special files without blocking, including replacements after lstat.
  const fd = fs.openSync(target, (options.saveContent ? fs.constants.O_RDWR : fs.constants.O_RDONLY) | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile()) fail("NOT_A_FILE");
    if (info.dev !== existing.dev || info.ino !== existing.ino) fail("INVALID_PATH");
    if (info.size > options.maxBytes) fail("FILE_TOO_LARGE");
    // One extra byte detects growth past the limit without reading the whole file.
    const bytes = Buffer.alloc(options.maxBytes + 1);
    let size = 0;
    while (size <= options.maxBytes) {
      const count = fs.readSync(fd, bytes, size, Math.min(65536, bytes.length - size), null);
      if (count === 0) break;
      size += count;
      if (size > options.maxBytes) fail("FILE_TOO_LARGE");
    }
    const after = fs.fstatSync(fd);
    if (after.size > options.maxBytes) fail("FILE_TOO_LARGE");
    if (after.size !== size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) fail("FILE_CHANGED");
    const data = bytes.subarray(0, size);
    if (data.includes(0)) fail("UNSUPPORTED_FILE_ENCODING");
    let content;
    try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data); }
    catch { fail("UNSUPPORTED_FILE_ENCODING"); }
    return { path: [options.parentPath, options.name].filter(Boolean).join("/"), content, size, ...(options.saveContent ? { info: after } : {}) };
  } finally {
    fs.closeSync(fd);
  }
};
const withWorkspaceFile = (options, operation) => {
  // Node has no openat API. Linux procfs lets us resolve each single component
  // relative to an open directory, even if another process renames that directory.
  // Never fall back to absolute pathname checks: an attacker can swap and restore
  // a parent between those checks while the opened file remains outside the workspace.
  if (process.platform !== "linux") fail("FILESYSTEM_UNAVAILABLE");
  const flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
  let parentFd = fs.openSync("/", flags);
  try {
    // Anchor the home path too; opening the workspace's full path would still
    // follow symlinks in .codaloud, workspace, or any earlier component.
    const parts = [...options.home.split("/").filter(Boolean), ".codaloud", "workspace", ...options.parentPath.split("/").filter(Boolean)];
    for (const part of parts) {
      validateName(part);
      let childFd;
      try { childFd = fs.openSync("/proc/self/fd/" + parentFd + "/" + part, flags); }
      catch (error) {
        if (error.code === "ELOOP" || error.code === "ENOTDIR") fail("INVALID_PATH");
        if (error.code === "ENOENT") fail("WORKSPACE_NOT_READY");
        throw error;
      }
      // Keep at most two directory descriptors live, regardless of path depth.
      const previousFd = parentFd;
      parentFd = childFd;
      fs.closeSync(previousFd);
    }
    validateName(options.name);
    const target = "/proc/self/fd/" + parentFd + "/" + options.name;
    return operation(parentFd, target);
  } finally {
    fs.closeSync(parentFd);
  }
};
`;
