import { formatWorkspaceAction } from "@/features/agent/lib/formatters";
import { describeToolError } from "@/features/agent/lib/tool-error-recovery";
import {
  agentTaskPayloadSchema,
  agentToolResultSchema,
} from "@/features/agent/schemas";
import {
  workspaceTools,
  type WorkspaceToolName,
} from "@/features/agent/tools/workspace-tools";
import {
  chargeCredits,
  InsufficientCreditsError,
  requireAvailableCredits,
} from "@/features/billing/server/billing-service";
import { billingRequiredMessage } from "@/features/billing/client-error";
import {
  modelCostUsd,
  reportedModelCostUsd,
} from "@/features/billing/credit-cost";
import { workspaceInstructions } from "@/services/ai/prompts";
import { meteredChatModel } from "@/services/ai/server";
import { scrapePage, searchWeb } from "@/services/firecrawl/tools";
import { metadata, schemaTask, wait } from "@trigger.dev/sdk";
import {
  dynamicTool,
  InvalidToolInputError,
  stepCountIs,
  streamText,
  tool,
  type ToolSet,
} from "ai";
import { z } from "zod";

export const workspaceTask = schemaTask({
  id: "workspace-task",
  schema: agentTaskPayloadSchema,
  retry: { maxAttempts: 1 },
  queue: { name: "workspace-tasks", concurrencyLimit: 1 },
  run: async (payload, { signal }) => {
    const startedAt = Date.now();
    let waitedMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let reportedCostUsd = 0;
    let modelCredits = 0;
    let webCredits = 0;
    let stepNumber = 0;
    const taskCreditLimit = 50;
    const logs: string[] = [];
    const log = async (text: string) => {
      logs.push(text.slice(0, 300));
      metadata.set("logs", logs.slice(-64));
      await metadata.flush();
    };
    const billed = async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          metadata.set("billingError", true);
          await log(billingRequiredMessage);
        }
        throw error;
      }
    };
    const checkpoint = async () => {
      if (modelCredits + webCredits >= taskCreditLimit)
        throw new Error(
          "Task credit limit reached. Review the completed steps.",
        );
      await billed(() => requireAvailableCredits(payload.userId));
    };
    let revision = payload.revision;
    let calls = 0;
    let queued = Promise.resolve();
    let failure: unknown;
    let failed = false;
    // Providers can return multiple tools despite parallelToolCalls: false.
    // Serialize execution, not rejection: failing a second call while the first
    // is in wait.forToken leaves the worker completing with an outstanding wait.
    const execute = <T>(operation: () => Promise<T>) => {
      const result = queued.then(async () => {
        if (failed) throw failure;
        try {
          signal.throwIfAborted();
          await checkpoint();
          if (++calls > 24) throw new Error("Task tool limit reached.");
          return await operation();
        } catch (error) {
          failed = true;
          failure = error;
          throw error;
        }
      });
      // Observe rejection immediately, but keep the original result for the SDK.
      // Queued actions must not execute after an uncertain or failed operation.
      queued = result.then(
        () => {},
        () => {},
      );
      return result;
    };
    const tools: ToolSet = {};
    for (const [name, definition] of Object.entries(workspaceTools)) {
      tools[name] = dynamicTool({
        description: definition.description,
        inputSchema: definition.schema,
        execute: (args, { toolCallId }) =>
          execute(async () => {
            try {
              const input = definition.schema.parse(args);
              if (JSON.stringify(input).length > 24000)
                throw new Error("Use a smaller edit.");
              await log(
                `Running: ${formatWorkspaceAction(name as WorkspaceToolName)}`,
              );
              const token = await wait.createToken({ timeout: "5m" });
              metadata.set("command", {
                id: toolCallId,
                tokenId: token.id,
                name,
                args: input,
                revision,
              });
              await metadata.flush();
              const waitStarted = Date.now();
              const completed = await wait.forToken(token.id);
              waitedMs += Date.now() - waitStarted;
              if (!completed.ok)
                throw new Error(
                  "The device did not finish the action in time. Reopen the app and review the workspace.",
                );
              const result = agentToolResultSchema.parse(completed.output);
              if (!result.ok) {
                await log(
                  `Failed ${formatWorkspaceAction(name as WorkspaceToolName)}: ${result.code ? `${result.code}: ` : ""}${result.text}`,
                );
                // A confirmed missing-folder read has no side effects. Let the
                // model inspect the parent and create the requested path. Never
                // recover writes, stale revisions, or unknown device failures.
                if (
                  name === "listFiles" &&
                  result.code === "DIRECTORY_NOT_FOUND"
                )
                  return { ok: false, code: result.code, text: result.text };
                throw new Error(result.text);
              }
              if (definition.mutation) {
                if (!result.revision)
                  throw new Error(
                    "The device did not confirm the workspace revision.",
                  );
                revision = result.revision;
              }
              await log(
                `Completed ${formatWorkspaceAction(name as WorkspaceToolName)}`,
              );
              return { text: result.text, truncated: result.truncated };
            } finally {
              metadata.del("command");
              await metadata.flush();
            }
          }),
      });
    }
    tools.searchWeb = tool({
      description:
        "Search the public web. Returns three compact results with citation URLs.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(300)
          .describe(
            "Public web search query, 1–300 characters; include the topic and relevant keywords. Do not include secrets or private project content.",
          ),
      }),
      execute: ({ query }) =>
        execute(async () => {
          await log("Searching the web");
          const result = await searchWeb(query);
          await billed(() =>
            chargeCredits(
              payload.userId,
              `agent:${payload.requestId}:web:${calls}`,
              2,
              "Web search",
            ),
          );
          webCredits += 2;
          await log("Web search completed");
          return result;
        }),
    });
    tools.scrapePage = tool({
      description:
        "Read the main text of one public web page. Preserve its URL when citing it.",
      inputSchema: z.object({
        url: z
          .url()
          .max(2048)
          .describe(
            "Absolute URL of the public web page to read, at most 2048 characters; use a relevant search result or user-provided HTTP(S) URL, not a local file or private address.",
          ),
      }),
      execute: ({ url }) =>
        execute(async () => {
          await log("Reading a web page");
          const result = await scrapePage(url);
          await billed(() =>
            chargeCredits(
              payload.userId,
              `agent:${payload.requestId}:web:${calls}`,
              1,
              "Web page scrape",
            ),
          );
          webCredits++;
          await log("Page read completed");
          return result;
        }),
    });
    // Queue concurrency is released at durable waits. Acquire the device's
    // per-project turn before the model sees files or plans any mutations.
    // Queue time must not consume an individual action's five-minute timeout.
    await log("Waiting for workspace");
    const startToken = await wait.createToken({ timeout: "24h" });
    try {
      metadata.set("command", {
        id: "begin-task",
        tokenId: startToken.id,
        name: "beginTask",
        args: {},
        revision,
      });
      await metadata.flush();
      const waitStarted = Date.now();
      const started = await wait.forToken(startToken.id);
      waitedMs += Date.now() - waitStarted;
      if (!started.ok)
        throw new Error(
          "The task could not start. Reopen the app and try again.",
        );
      const result = agentToolResultSchema.parse(started.output);
      if (!result.ok) throw new Error(result.text);
      if (!result.revision)
        throw new Error(
          "The device did not confirm the starting workspace revision.",
        );
      revision = result.revision;
      signal.throwIfAborted();
    } finally {
      metadata.del("command");
      await metadata.flush();
    }
    await log("Working on your request");
    await billed(() => requireAvailableCredits(payload.userId, 2));
    const response = streamText({
      model: meteredChatModel(payload.agentModel, { parallelToolCalls: false }),
      system: workspaceInstructions,
      prompt: payload.instruction,
      tools,
      repairToolCall: async ({ toolCall, error }) => {
        if (
          toolCall.toolName !== "listFiles" ||
          !InvalidToolInputError.isInstance(error)
        )
          return null;
        try {
          const input: unknown = JSON.parse(toolCall.input);
          if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            !("path" in input) ||
            (input.path !== "." && input.path !== "./")
          )
            return null;
          // The SDK revalidates this once before execution. Repair only the
          // unambiguous root alias, retaining other fields so strict validation
          // still rejects extras. Never normalize traversal or retry mutations.
          return { ...toolCall, input: JSON.stringify({ ...input, path: "" }) };
        } catch {
          return null;
        }
      },
      // Allow all 24 calls sequentially, then one step for the final summary.
      stopWhen: stepCountIs(25),
      maxOutputTokens: 8000,
      maxRetries: 0,
      providerOptions: { openrouter: { reasoning: { enabled: false } } },
      abortSignal: signal,
      onStepFinish: async ({ usage, providerMetadata }) => {
        inputTokens += usage.inputTokens ?? 0;
        outputTokens += usage.outputTokens ?? 0;
        reportedCostUsd +=
          reportedModelCostUsd(providerMetadata) ??
          modelCostUsd(payload.agentModel, usage) * 1.2;
        if (calls === 0) return;
        const activeSeconds =
          Math.max(0, Date.now() - startedAt - waitedMs) / 1000;
        const cost =
          modelCostUsd(payload.agentModel, {
            inputTokens,
            outputTokens,
            costUsd: reportedCostUsd,
          }) +
          activeSeconds * 0.0000338 +
          0.000025;
        const due = Math.max(2, Math.ceil(cost / 0.008));
        if (due + webCredits > taskCreditLimit)
          throw new Error(
            "Task credit limit reached. Review the completed steps.",
          );
        const additional = due - modelCredits;
        if (additional > 0) {
          await billed(() =>
            chargeCredits(
              payload.userId,
              `agent:${payload.requestId}:model:${stepNumber}`,
              additional,
              `Agent task · model and compute checkpoint ${stepNumber + 1}`,
            ),
          );
          modelCredits = due;
        }
        stepNumber++;
      },
    });
    let summary = "";
    try {
      for await (const part of response.stream) {
        if (part.type === "error") throw part.error;
        if (part.type === "abort") throw new Error("Task generation stopped.");
        if (part.type === "text-delta")
          summary = (summary + part.text).slice(-3000);
        if (part.type === "tool-error") {
          const outcome = describeToolError(part.toolName, part.error);
          await log(outcome.message);
          // A schema rejection never reached the tool body, so the model can
          // correct its own arguments on the next step. Execution failures stay
          // fatal so a mutation with an unknown result is never retried.
          if (!outcome.recoverable)
            throw new Error(outcome.message, { cause: part.error });
        }
        if (part.type === "start-step") summary = "";
      }
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    } finally {
      // Stream/validation errors can bypass execute. Never return a Trigger run
      // while a started device action still owns its waitpoint and metadata.
      await queued;
    }
    if (calls === 0 || (await response.finishReason) === "tool-calls")
      throw new Error("The task did not finish within its tool budget.");
    if (!summary.trim())
      throw new Error("The task did not produce a final summary.");
    await log("Finished — ready to review");
    return { summary: summary.trim() };
  },
});
