import { z } from "zod";
import { codeIntelligenceRequestSchema, codeIntelligenceResultSchema, type CodeIntelligenceRequestSchema } from "@/features/projects/actions/code-intelligence-schemas";
import { getSandboxToolboxUrl, requestDaytona, SandboxFilesError } from "./api";
import { createTypescriptCommand } from "./typescript-command";

export const readSandboxCodeIntelligence = async (
  context: { sandboxId: string; projectId: string }, unsafeInput: CodeIntelligenceRequestSchema,
) => {
  const input = codeIntelligenceRequestSchema.parse(unsafeInput);
  const toolboxUrl = await getSandboxToolboxUrl(context.sandboxId, context.projectId);
  const { dir: home } = z.object({ dir: z.string().startsWith("/").min(2) }).parse(await requestDaytona(`${toolboxUrl}/user-home-dir`));
  const response = z.object({ exitCode: z.number(), result: z.string() }).parse(await requestDaytona(`${toolboxUrl}/process/execute`, {
    method: "POST", body: JSON.stringify(createTypescriptCommand({ ...input, home })), signal: AbortSignal.timeout(65_000),
  }));
  if (response.exitCode !== 0) throw new SandboxFilesError(503, "ANALYSIS_UNAVAILABLE", "Code analysis is unavailable. Please try again.");
  return codeIntelligenceResultSchema.parse(JSON.parse(response.result));
};
