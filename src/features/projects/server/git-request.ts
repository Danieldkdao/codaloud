import { SandboxFilesError } from "@/services/daytona/api";

// Bound allocation before parsing, including requests without Content-Length.
// The limit leaves room for a 5,000-character Unicode message and branch names.
export const readGitJson = async (request: Request): Promise<unknown> => {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) {
        await reader.cancel();
        throw new SandboxFilesError(413, "GIT_REQUEST_TOO_LARGE", "Git request bodies must be no larger than 64 KiB.");
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
