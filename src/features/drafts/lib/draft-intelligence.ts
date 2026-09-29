import {
  codeIntelligenceRequestSchema,
  type CodeIntelligenceRequestSchema,
  type CodeIntelligenceResultSchema,
} from "@/features/projects/actions/code-intelligence-schemas";
import type { createTypeScriptAnalyzer } from "@/services/typescript/analysis";

// A draft owns one file, so its session only ever serves that buffer. Bound
// compiler memory the same way the project session is bound.
let session:
  | {
      path: string;
      content: string;
      analyzer: ReturnType<typeof createTypeScriptAnalyzer>;
    }
  | undefined;

/**
 * TypeScript and JavaScript diagnostics for a draft, with no project files, no
 * other drafts, and no repository graph as context.
 */
export const readDraftCodeIntelligence = async (
  unsafeInput: CodeIntelligenceRequestSchema,
): Promise<CodeIntelligenceResultSchema | null> => {
  try {
    const input = codeIntelligenceRequestSchema.parse(unsafeInput);
    const { createTypeScriptAnalyzer } =
      await import("@/services/typescript/analysis");
    if (session?.path !== input.path) {
      void session?.analyzer.dispose();
      session = {
        path: input.path,
        content: input.content,
        analyzer: createTypeScriptAnalyzer(
          async (path) =>
            session?.path === path ? session.content : null,
          async () => [],
        ),
      };
    }
    session.content = input.content;
    return await session.analyzer.analyze(input);
  } catch {
    return null;
  }
};

/** Releases the compiler when the draft screen closes. */
export const disposeDraftIntelligence = () => {
  const closing = session;
  session = undefined;
  void closing?.analyzer.dispose();
};
