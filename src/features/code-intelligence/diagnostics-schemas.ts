import { z } from "zod";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";
import { MAX_PROJECT_FILE_SIZE_BYTES } from "@/features/projects/constants";
import { codeDiagnosticSchema } from "@/features/projects/actions/code-intelligence-schemas";

/** Contract for analyzing one buffer off-device: Hermes has no WebAssembly, so
 * the wasm analyzers run on the server where the agent and editor agree. */
export const remoteDiagnosticsRequestSchema = z.object({
  path: projectFilePathSchema,
  content: z
    .string()
    .max(MAX_PROJECT_FILE_SIZE_BYTES)
    .refine(
      (content) =>
        new TextEncoder().encode(content).length <= MAX_PROJECT_FILE_SIZE_BYTES,
    ),
});
export type RemoteDiagnosticsRequestSchema = z.infer<
  typeof remoteDiagnosticsRequestSchema
>;

export const remoteDiagnosticsResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    // Positions are already normalized against the submitted content.
    diagnostics: z.array(codeDiagnosticSchema),
  }),
  z.object({ status: z.enum(["unavailable", "unsupported"]) }),
]);
export type RemoteDiagnosticsResultSchema = z.infer<
  typeof remoteDiagnosticsResultSchema
>;
