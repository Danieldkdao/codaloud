import { sandboxCommandInput } from "./create-command";

// Executed inside Daytona. Node is already required by the existing filesystem
// helper; this keeps literal matching and limits independent of installed rg versions.
export const sandboxFileSearchCommand = sandboxCommandInput + String.raw`
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const limits = input.limits;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const deadline = Date.now() + limits.scanTimeoutMs;
const checkTime = () => { if (Date.now() > deadline) fail("SEARCH_LIMIT_EXCEEDED"); };
const validName = (name) => name && name !== "." && name !== ".." && !/[\/\\\x00-\x1f\x7f]/.test(name) && !name.includes("\ufffd");
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const signature = (info) => [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].map(String).join(":");
const stat = (fd) => fs.fstatSync(fd, { bigint: true });
const anchor = (fd) => "/proc/self/fd/" + fd;
const child = (fd, name) => anchor(fd) + "/" + name;
const openDirectory = (parent, name, create = false) => {
  if (!validName(name)) fail("INVALID_PATH");
  if (create) {
    try { fs.mkdirSync(child(parent, name), { mode: 0o700 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  try { return fs.openSync(child(parent, name), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW); }
  catch (error) {
    if (error.code === "ELOOP" || error.code === "ENOTDIR") fail("INVALID_PATH");
    if (error.code === "ENOENT") fail("WORKSPACE_NOT_READY");
    throw error;
  }
};
const readBounded = (fd, maxBytes) => {
  const before = stat(fd);
  if (!before.isFile() || before.size > BigInt(maxBytes)) fail("SEARCH_LIMIT_EXCEEDED");
  const bytes = Buffer.alloc(Number(before.size) + 1);
  let size = 0;
  while (size < bytes.length) {
    checkTime();
    const count = fs.readSync(fd, bytes, size, Math.min(65536, bytes.length - size), null);
    if (!count) break;
    size += count;
  }
  if (size !== Number(before.size) || signature(before) !== signature(stat(fd))) fail("SEARCH_WORKSPACE_CHANGED");
  return bytes.subarray(0, size);
};
const scan = (root, readContents) => {
  const records = [];
  const matches = new Map();
  let entries = 0;
  let readBytes = 0;
  let metadataBytes = 0;
  let skippedContentFiles = 0;
  const needle = input.search.toLowerCase();
  const record = (path, metadata) => {
    metadataBytes += Buffer.byteLength(JSON.stringify([path, metadata]));
    if (metadataBytes > limits.maxMetadataBytes) fail("SEARCH_LIMIT_EXCEEDED");
    records.push([path, metadata]);
  };
  const walk = (directory, prefix, depth) => {
    checkTime();
    if (depth > 128) fail("SEARCH_LIMIT_EXCEEDED");
    const before = signature(stat(directory));
    record(prefix, before);
    // Read entries incrementally so one huge directory cannot allocate an unbounded array.
    const iterator = fs.opendirSync(anchor(directory));
    try {
      let entry;
      while ((entry = iterator.readSync()) !== null) {
        checkTime();
        if (++entries > limits.maxEntries) fail("SEARCH_LIMIT_EXCEEDED");
        if (!validName(entry.name)) continue;
        if (entry.name === ".git") continue;
        const relative = prefix ? prefix + "/" + entry.name : entry.name;
        if (relative.length > 4096) fail("SEARCH_LIMIT_EXCEEDED");
        const target = child(directory, entry.name);
        const info = fs.lstatSync(target, { bigint: true });
        if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) continue;
        if (info.isDirectory()) {
          if (input.excludedDirectories.includes(entry.name)) continue;
          const nested = openDirectory(directory, entry.name);
          try { walk(nested, relative, depth + 1); } finally { fs.closeSync(nested); }
          continue;
        }
        record(relative, signature(info));
        if (!readContents) continue;
        const titleMatches = input.scope !== "content" && entry.name.toLowerCase().includes(needle);
        let contentMatchCount = 0;
        let contentSearched = false;
        if (input.scope !== "title") {
          if (info.size > BigInt(limits.maxFileBytes)) skippedContentFiles++;
          else {
            readBytes += Number(info.size);
            if (readBytes > limits.maxContentBytes) fail("SEARCH_LIMIT_EXCEEDED");
            const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
            let bytes;
            try {
              if (signature(stat(fd)) !== signature(info)) fail("SEARCH_WORKSPACE_CHANGED");
              bytes = readBounded(fd, limits.maxFileBytes);
            } finally { fs.closeSync(fd); }
            let text;
            try { if (bytes.includes(0)) throw new Error(); text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).toLowerCase(); }
            catch { skippedContentFiles++; }
            if (text !== undefined) {
              contentSearched = true;
              let position = 0;
              // Count occurrences, not matching lines, without building a split array.
              while ((position = text.indexOf(needle, position)) !== -1) {
                contentMatchCount++;
                position += needle.length;
              }
            }
          }
        }
        if (titleMatches || contentMatchCount) {
          matches.set(relative, { path: relative, titleMatches, contentMatchCount, contentSearched });
          if (matches.size > limits.maxResults) fail("SEARCH_LIMIT_EXCEEDED");
        }
      }
    } finally { iterator.closeSync(); }
    if (before !== signature(stat(directory))) fail("SEARCH_WORKSPACE_CHANGED");
  };
  walk(root, input.path, 0);
  records.sort((a, b) => compare(a[0], b[0]));
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
  const files = [...matches.values()].sort((a, b) => b.contentMatchCount - a.contentMatchCount || compare(a.path, b.path));
  return { fingerprint, files, skippedContentFiles };
};
const cursorSignature = (session, position) => crypto.createHmac("sha256", session.secret).update(session.id + ":" + position).digest("hex");
const page = (session, offset) => {
  const next = offset + input.pageSize;
  return {
    files: session.files.slice(offset, next), totalCount: session.files.length,
    nextCursor: next < session.files.length ? session.id + ":" + next + ":" + cursorSignature(session, next) : null,
    searchedAt: new Date(session.createdAt).toISOString(), expiresAt: new Date(session.expiresAt).toISOString(),
    skippedContentFiles: session.skippedContentFiles,
  };
};
const run = () => {
  if (process.platform !== "linux") fail("SEARCH_UNAVAILABLE");
  // Anchor every component, including the sandbox home, to avoid following a
  // parent symlink or a directory replacement outside this workspace.
  let directory = fs.openSync("/", fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  let base;
  let workspace;
  let root;
  let sessions;
  try {
    for (const name of input.home.split("/").filter(Boolean)) {
      const next = openDirectory(directory, name);
      fs.closeSync(directory); directory = next;
    }
    base = openDirectory(directory, ".codaloud", input.allowInitialize);
    workspace = openDirectory(base, "workspace", input.allowInitialize);
    root = openDirectory(base, "workspace");
    for (const name of input.path.split("/").filter(Boolean)) {
      if (input.excludedDirectories.includes(name)) fail("INVALID_PATH");
      const next = openDirectory(root, name);
      fs.closeSync(root); root = next;
    }
    const rootIdentity = signature(stat(root));
    const verifyRoot = () => {
      let current = openDirectory(base, "workspace");
      try {
        for (const name of input.path.split("/").filter(Boolean)) {
          const next = openDirectory(current, name);
          fs.closeSync(current); current = next;
        }
        if (signature(stat(current)) !== rootIdentity) fail("SEARCH_WORKSPACE_CHANGED");
      } finally { fs.closeSync(current); }
    };
    sessions = openDirectory(base, "file-search", true);
    if (input.cursor) {
      const [id, offsetText, suppliedSignature] = input.cursor.split(":");
      const offset = Number(offsetText);
      let session;
      try {
        const fd = fs.openSync(child(sessions, input.scopeKey + "-" + id + ".json"), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        try { session = JSON.parse(readBounded(fd, limits.maxSessionBytes).toString("utf8")); }
        finally { fs.closeSync(fd); }
      } catch { fail("SEARCH_SESSION_EXPIRED"); }
      if (session.scopeKey !== input.scopeKey || session.id !== id || session.expiresAt <= Date.now()) fail("SEARCH_SESSION_EXPIRED");
      if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= session.files.length || offset % input.pageSize
        || !crypto.timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(cursorSignature(session, offset)))) fail("INVALID_SEARCH_CURSOR");
      if (scan(root, false).fingerprint !== session.fingerprint) fail("SEARCH_WORKSPACE_CHANGED");
      verifyRoot();
      return page(session, offset);
    }
    const result = scan(root, true);
    if (scan(root, false).fingerprint !== result.fingerprint) fail("SEARCH_WORKSPACE_CHANGED");
    verifyRoot();
    const now = Date.now();
    const session = { ...result, id: crypto.randomUUID(), scopeKey: input.scopeKey,
      secret: crypto.randomBytes(32).toString("hex"), createdAt: now, expiresAt: now + limits.sessionTtlMs };
    if (session.files.length > input.pageSize) {
      const serialized = JSON.stringify(session);
      if (Buffer.byteLength(serialized) > limits.maxSessionBytes) fail("SEARCH_LIMIT_EXCEEDED");
      // The directory descriptor holds the lock after flock exits, serializing
      // eviction and publication across independent API workers and commands.
      try { execFileSync("flock", ["-x", "-w", "2", "3"], { stdio: ["ignore", "pipe", "pipe", sessions], timeout: 2500 }); }
      catch { fail("SEARCH_BUSY"); }
      const existing = [];
      const iterator = fs.opendirSync(anchor(sessions));
      try {
        let entry;
        let count = 0;
        while ((entry = iterator.readSync()) !== null) {
          if (++count > 1000) fail("SEARCH_LIMIT_EXCEEDED");
          if (!/^[a-f0-9]{64}-[a-f0-9-]{36}\.json$/.test(entry.name)) continue;
          const target = child(sessions, entry.name);
          const info = fs.lstatSync(target);
          if (info.mtimeMs + limits.sessionTtlMs <= now) fs.unlinkSync(target);
          else existing.push({ name: entry.name, mtime: info.mtimeMs });
        }
      } finally { iterator.closeSync(); }
      existing.sort((a, b) => a.mtime - b.mtime);
      while (existing.length >= limits.maxSessions) fs.unlinkSync(child(sessions, existing.shift().name));
      const target = child(sessions, input.scopeKey + "-" + session.id + ".json");
      const fd = fs.openSync(target, "wx", 0o600);
      try { fs.writeFileSync(fd, serialized); }
      catch (error) { fs.unlinkSync(target); throw error; }
      finally { fs.closeSync(fd); }
    }
    return page(session, 0);
  } finally {
    for (const fd of [sessions, root, workspace, base, directory]) if (fd !== undefined) fs.closeSync(fd);
  }
};
try { process.stdout.write(JSON.stringify(run())); }
catch (error) {
  const known = ["SEARCH_SESSION_EXPIRED", "INVALID_SEARCH_CURSOR", "SEARCH_WORKSPACE_CHANGED", "SEARCH_LIMIT_EXCEEDED", "SEARCH_BUSY", "WORKSPACE_NOT_READY", "INVALID_PATH"];
  const changed = ["ENOENT", "ELOOP", "ENOTDIR"].includes(error.code);
  process.stdout.write(JSON.stringify({ code: known.includes(error.code) ? error.code : changed ? "SEARCH_WORKSPACE_CHANGED" : "SEARCH_UNAVAILABLE" }));
  process.exitCode = 1;
}
`;
