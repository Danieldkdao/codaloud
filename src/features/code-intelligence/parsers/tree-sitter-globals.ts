export const ensureTreeSitterGlobals = () => {
  const scope = globalThis as {
    process?: { versions?: Record<string, string> };
  };
  if (!scope.process) scope.process = {};
  if (!scope.process.versions) scope.process.versions = {};
};

// undici reads `process.versions.node` on its first dispatch and throws if it is
// hidden, so force that one-time init before selecting a runtime's browser branch.
let nodeFetchWarmed = false;
const warmNodeFetch = async () => {
  if (nodeFetchWarmed || typeof globalThis.fetch !== "function") return;
  nodeFetchWarmed = true;
  try {
    await globalThis.fetch("data:text/plain,warm");
  } catch {
    // A failed warm is harmless: the version read still ran during dispatch.
  }
};

export const withTreeSitterNodeDetectionDisabled = async <T>(
  init: () => Promise<T>,
): Promise<T> => {
  const versions = (
    globalThis as { process?: { versions?: Record<string, unknown> } }
  ).process?.versions;
  if (!versions || versions.node === undefined) return init();

  await warmNodeFetch();
  const descriptor = Object.getOwnPropertyDescriptor(versions, "node");
  try {
    Object.defineProperty(versions, "node", {
      value: undefined,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    return await init();
  } finally {
    if (descriptor) Object.defineProperty(versions, "node", descriptor);
  }
};
