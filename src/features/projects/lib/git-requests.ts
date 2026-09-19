import { z } from "zod";
import { LocalWorkspaceError } from "@/services/local-workspace/execute";
import type {
  ProjectGitMutationFailure,
  ProjectGitMutationResult,
  ProjectGitReadFailureHandler,
} from "../types";

export const readProjectGitRequest = async <
  I extends Record<string, string | number | boolean | null | undefined>,
  O,
>({
  execute,
  output,
  signal,
  input,
  params = {},
  validate,
  onFailure,
}: {
  execute: (input: I) => Promise<unknown>;
  output: z.ZodType<O>;
  signal?: AbortSignal;
  input: z.ZodType<I>;
  params?: unknown;
  validate?: (data: O, input: I) => boolean;
  onFailure?: ProjectGitReadFailureHandler;
}): Promise<O | null> => {
  try {
    if (signal?.aborted) return null;
    const parsed = input.parse(params);
    const data = output.parse(
      await execute(parsed),
    );
    if (signal?.aborted) return null;
    return !validate || validate(data, parsed) ? data : null;
  } catch (error) {
    if (!signal?.aborted)
      onFailure?.(
        error instanceof LocalWorkspaceError && error.code.includes("CURSOR")
          ? 400
          : 500,
        null,
        error instanceof LocalWorkspaceError ? error.code : undefined,
      );
    return null;
  }
};

export const mutateProjectGitRequest = async <I, O>({
  execute,
  input,
  unsafeInput,
  output,
  validate,
  errors = {},
}: {
  execute: (input: I) => Promise<unknown>;
  input: z.ZodType<I>;
  unsafeInput: unknown;
  output: z.ZodType<O>;
  validate?: (data: O, input: I) => boolean;
  errors?: Partial<
    Record<
      | "session"
      | "unauthenticated"
      | "project"
      | "input"
      | "preparation"
      | "unknownOutcome",
      ProjectGitMutationFailure
    >
  >;
}): Promise<ProjectGitMutationResult<O>> => {
  let started = false;
  try {
    const parsed = input.safeParse(unsafeInput);
    if (!parsed.success)
      return (
        errors.input ?? {
          error: true,
          code: "INVALID_GIT_INPUT",
          message: "Invalid Git parameters.",
        }
      );
    started = true;
    const data = output.parse(
      await execute(parsed.data),
    );
    if (validate && !validate(data, parsed.data))
      throw new Error(
        "Unable to confirm this Git operation. Refresh the workspace.",
      );
    return { error: false, message: "Git operation completed.", data };
  } catch (error) {
    if (error instanceof LocalWorkspaceError)
      return { error: true, code: error.code, message: error.message };
    if (error instanceof z.ZodError && started)
      return (
        errors.unknownOutcome ?? {
          error: true,
          code: "GIT_OUTCOME_UNKNOWN",
          message: "Refresh the workspace before retrying this operation.",
        }
      );
    return {
      error: true,
      code: "LOCAL_GIT_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unable to complete this Git operation.",
    };
  }
};
