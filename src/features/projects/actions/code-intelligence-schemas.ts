import { z } from "zod";
import { projectFilePathSchema } from "./file-schemas";
import {
  CODE_INTELLIGENCE_FILE_PATTERN,
  MAX_PROJECT_FILE_SIZE_BYTES,
} from "@/features/projects/constants";

export const diagnosticSeverities = ["error", "warning", "info"] as const;
export type DiagnosticSeverity = (typeof diagnosticSeverities)[number];
export const codeIntelligenceOperations = [
  "format",
  "organize-imports",
] as const;
export type CodeIntelligenceOperation =
  (typeof codeIntelligenceOperations)[number];

export const codeIntelligenceRequestSchema = z
  .object({
    path: projectFilePathSchema.refine((path) =>
      CODE_INTELLIGENCE_FILE_PATTERN.test(path),
    ),
    content: z
      .string()
      .max(MAX_PROJECT_FILE_SIZE_BYTES)
      .refine(
        (content) =>
          new TextEncoder().encode(content).length <=
          MAX_PROJECT_FILE_SIZE_BYTES,
      ),
    operation: z.enum(codeIntelligenceOperations).optional(),
    tabSize: z.number().int().min(1).max(8).optional(),
    useTabs: z.boolean().optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .refine(
    ({ content, position }) =>
      position === undefined || position <= content.length,
  );
export type CodeIntelligenceRequestSchema = z.infer<
  typeof codeIntelligenceRequestSchema
>;

export const codeDiagnosticSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    severity: z.enum(diagnosticSeverities),
    message: z.string(),
    code: z.number().int(),
  })
  .refine(({ from, to }) => to >= from);
export type CodeDiagnosticSchema = z.infer<typeof codeDiagnosticSchema>;

export const codeCompletionSchema = z.object({
  label: z.string(),
  type: z.string(),
  apply: z.string(),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().nonnegative().optional(),
});
export type CodeCompletionSchema = z.infer<typeof codeCompletionSchema>;

export const codeTextEditSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  insert: z.string(),
});
export type CodeTextEditSchema = z.infer<typeof codeTextEditSchema>;

export const codeIntelligenceResultSchema = z.union([
  z.object({ edits: z.array(codeTextEditSchema) }),
  z.object({ diagnostics: z.array(codeDiagnosticSchema) }),
  z.object({ completions: z.array(codeCompletionSchema) }),
]);
export type CodeIntelligenceResultSchema = z.infer<
  typeof codeIntelligenceResultSchema
>;
