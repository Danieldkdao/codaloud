import { SandboxFilesError } from "@/services/daytona/api";

// Bound allocation before parsing, including requests without Content-Length.
// Most Git requests need only a message or branch name. Selected-file commits
// explicitly allow a larger bounded body for their existing path-list contract.
export const readGitJson = async (request: Request, maxBytes = 64 * 1024): Promise<unknown> => {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new SandboxFilesError(413, "GIT_REQUEST_TOO_LARGE", `Git request bodies must be no larger than ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof SandboxFilesError) throw error;
    return null;
  } finally {
    reader.releaseLock();
  }
};
