// Hermes has no Node `wasi` module, but several language runtimes are compiled
// against wasi_snapshot_preview1 and declare every preview1 function as an
// import. WebAssembly refuses to instantiate a module with unresolved imports,
// so the full set must be present even when the parser only ever calls a few
// of them.
//
// This shim answers the imports a parser can legitimately need (arguments,
// environment, clocks, randomness, writing to stdout/stderr) and reports
// "not implemented" for the filesystem surface. A parser that tries to open a
// file therefore fails loudly instead of silently seeing a phantom empty
// directory, which matters because these analyzers only ever parse the buffer
// they were handed.
export const WASI_NOT_IMPLEMENTED = 52;

const writeUint32 = (memory: WebAssembly.Memory, pointer: number, value: number) =>
  new DataView(memory.buffer).setUint32(pointer, value, true);

const writeUint64 = (
  memory: WebAssembly.Memory,
  pointer: number,
  value: bigint,
) => new DataView(memory.buffer).setBigUint64(pointer, value, true);

const notImplemented = () => WASI_NOT_IMPLEMENTED;

export const createWasiImports = (options?: {
  onStderr?: (message: string) => void;
  onStdout?: (message: string) => void;
}) => {
  // The shim needs the instance memory to service calls that write a result
  // back through a pointer, but memory only exists after instantiation. Resolve
  // it lazily through a holder the caller fills in once the instance is built.
  let memory: WebAssembly.Memory | undefined;

  // Read a NUL-terminated UTF-8 string out of linear memory. Used for stdout
  // and stderr, which arrive as an iovec array rather than a plain string.
  const readCString = (pointer: number) => {
    if (!memory) return "";
    const bytes = new Uint8Array(memory.buffer);
    let end = pointer;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return new TextDecoder().decode(bytes.subarray(pointer, end));
  };

  // preview1 passes a list of (pointer, length) pairs, so a message can be
  // split across several buffers.
  const readIovs = (iovs: number, iovsLength: number) => {
    if (!memory) return "";
    const view = new DataView(memory.buffer);
    let message = "";
    for (let index = 0; index < iovsLength; index++) {
      const base = view.getUint32(iovs + index * 8, true);
      const length = view.getUint32(iovs + index * 8 + 4, true);
      const bytes = new Uint8Array(memory.buffer, base, length);
      message += new TextDecoder().decode(bytes);
    }
    return message;
  };

  const requireMemory = () => {
    if (!memory) throw new Error("WASI shim used before instantiation");
    return memory;
  };

  const wasi = {
    args_get: notImplemented,
    args_sizes_get: (countPointer: number, sizePointer: number) => {
      const view = new DataView(requireMemory().buffer);
      view.setUint32(countPointer, 0, true);
      view.setUint32(sizePointer, 0, true);
      return 0;
    },
    environ_get: notImplemented,
    environ_sizes_get: (countPointer: number, sizePointer: number) => {
      const view = new DataView(requireMemory().buffer);
      view.setUint32(countPointer, 0, true);
      view.setUint32(sizePointer, 0, true);
      return 0;
    },
    clock_res_get: (_id: number, pointer: number) => {
      writeUint64(requireMemory(), pointer, 1000n);
      return 0;
    },
    clock_time_get: (_id: number, _precision: bigint, pointer: number) => {
      // Real time is not meaningful for a parser, and a wall clock would make
      // analyzer output non-deterministic. Report a fixed instant.
      writeUint64(requireMemory(), pointer, 0n);
      return 0;
    },
    fd_write: (
      fd: number,
      iovs: number,
      iovsLength: number,
      writtenPointer: number,
    ) => {
      const message = readIovs(iovs, iovsLength);
      // 1 is stdout, 2 is stderr, matching preview1.
      if (fd === 1) options?.onStdout?.(message);
      else options?.onStderr?.(message);
      writeUint32(requireMemory(), writtenPointer, message.length);
      return 0;
    },
    fd_read: notImplemented,
    fd_close: () => 0,
    fd_datasync: notImplemented,
    fd_fdstat_get: (_fd: number, pointer: number) => {
      // Advertise a character device so callers treat stdout as a terminal.
      const view = new DataView(requireMemory().buffer);
      view.setUint8(pointer, 2);
      return 0;
    },
    fd_fdstat_set_flags: () => 0,
    fd_filestat_get: notImplemented,
    fd_prestat_get: notImplemented,
    fd_prestat_dir_name: notImplemented,
    fd_seek: notImplemented,
    fd_sync: notImplemented,
    fd_tell: notImplemented,
    fd_advise: () => 0,
    fd_allocate: () => 0,
    fd_renumber: notImplemented,
    fd_pread: notImplemented,
    fd_pwrite: notImplemented,
    fd_readdir: notImplemented,
    fd_filestat_set_size: notImplemented,
    fd_filestat_set_times: notImplemented,
    path_open: notImplemented,
    path_filestat_get: notImplemented,
    path_filestat_set_times: notImplemented,
    path_create_directory: notImplemented,
    path_link: notImplemented,
    path_readlink: notImplemented,
    path_remove_directory: notImplemented,
    path_rename: notImplemented,
    path_symlink: notImplemented,
    path_unlink_file: notImplemented,
    poll_oneoff: notImplemented,
    proc_exit: () => 0,
    proc_raise: notImplemented,
    sched_yield: () => 0,
    random_get: (pointer: number, length: number) => {
      const target = new Uint8Array(requireMemory().buffer, pointer, length);
      crypto.getRandomValues(target);
      return 0;
    },
    sock_recv: notImplemented,
    sock_send: notImplemented,
    sock_shutdown: notImplemented,
  };

  return {
    imports: {
      // Preview1 modules import a wide, build-specific subset. A Proxy supplies
      // any name the binary asks for that is not listed above, so a runtime
      // built against a different revision still instantiates instead of
      // failing with a link error. A stub reports "not implemented", which is
      // the honest answer for a capability this platform does not have.
      wasi_snapshot_preview1: new Proxy(wasi, {
        get: (target, property) =>
          property in target
            ? (target as Record<string | symbol, unknown>)[property]
            : notImplemented,
      }),
    },
    setMemory: (instanceMemory: WebAssembly.Memory) => {
      memory = instanceMemory;
    },
  };
};
