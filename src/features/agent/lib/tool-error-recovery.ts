import { InvalidToolInputError } from "ai";

export type ToolErrorOutcome = {
  /** True when nothing was mutated, so the model may correct and resend. */
  recoverable: boolean;
  message: string;
};

/**
 * Decide whether a tool failure should end the task or be handed back to the
 * model.
 *
 * The AI SDK already turns a tool failure into a `tool-error` part and feeds
 * it back to the model on the next step, which is how an agent corrects its
 * own arguments. That recovery is only safe when the tool body never ran, so
 * only schema rejections qualify: they are rejected during input validation,
 * before any mutation. Everything else, including an execution failure whose
 * result is unknown, must stay fatal so a mutation is never retried blindly.
 */
export const describeToolError = (
  toolName: string,
  error: unknown,
): ToolErrorOutcome => {
  if (InvalidToolInputError.isInstance(error))
    return {
      recoverable: true,
      message: `${toolName} was called with arguments that do not match its schema. Correct the arguments and call it again.`,
    };
  return {
    recoverable: false,
    message: `A tool failed (${toolName}). Review completed steps before trying again.`,
  };
};
