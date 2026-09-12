import { gzipSync } from "node:zlib";

export const sandboxCommandInput = String.raw`
const encoded = Array.from({ length: Number(process.env.CODALOUD_INPUT_CHUNKS) }, (_, index) => process.env["CODALOUD_INPUT_" + index]).join("");
const input = JSON.parse(require("node:zlib").gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
`;

export const createSandboxCommand = (script: string, input: unknown, timeout: number) => {
  // Compress and split buffers below Linux's per-argument/environment limit.
  // Payloads remain data, including shell metacharacters in paths and content.
  const payload = gzipSync(Buffer.from(JSON.stringify(input))).toString("base64");
  const chunks = payload.match(/.{1,60000}/g) ?? [];
  const envs: Record<string, string> = { CODALOUD_INPUT_CHUNKS: String(chunks.length) };
  chunks.forEach((chunk, index) => { envs[`CODALOUD_INPUT_${index}`] = chunk; });
  return { command: `node -e '${script.replace(/'/g, "'\\''")}'`, envs, timeout };
};
