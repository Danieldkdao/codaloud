import { z } from "zod";
import { sha256Hex } from "@/lib/hashes";
import { inlineSession } from "./inline-session";
import { commandCenter } from "./command-center";
import {
  commandNavigationSchema,
  commandOpenFileSchema,
  navigateCommand,
} from "./command-navigation";
import {
  workspaceTools,
  type WorkspaceToolName,
} from "@/features/agent/tools/workspace-tools";
import {
  flushAgentWorkspace,
  runAgentMutation,
} from "@/features/agent/workspace-access";
import {
  executeDeviceTool,
  readWorkspaceRevision,
} from "@/features/agent/tools/device-tools";
import { editorPreferencesStore } from "@/features/settings/hooks/use-editor-preferences";
import {
  parsePathRules,
  pathMatchesRule,
  pathRulesAreValid,
} from "@/features/settings/lib/path-rules";

const runCommandAction = async (projectId: string, payload: unknown) => {
  const input = z
    .object({
      id: z.string().max(256),
      name: z.string().max(64),
      args: z.unknown(),
      callId: z.string().max(256).optional(),
    })
    .parse(payload);
  const check = () => {
    const current = inlineSession.getSnapshot();
    if (
      current?.id !== input.id ||
      current.projectId !== projectId ||
      current.status !== "listening"
    )
      throw new Error("Request cancelled or workspace changed.");
  };
  check();
  if (input.name === "navigate") {
    await navigateCommand(projectId, commandNavigationSchema.parse(input.args));
    return { ok: true };
  }
  if (input.name === "openFile") {
    if (projectId === "app" || projectId.startsWith("draft:"))
      throw new Error("Open a project first.");
    const args = commandOpenFileSchema.parse(input.args);
    await editorPreferencesStore.load();
    check();
    const rules =
      editorPreferencesStore.getSnapshot().preferences.aiDisabledPaths;
    if (!pathRulesAreValid(rules))
      throw new Error(
        "Fix the Disabled Files / Folders list in Editor Settings before using AI.",
      );
    if (pathMatchesRule(args.path, parsePathRules(rules)))
      throw new Error("This file is disabled for AI in Editor Settings.");
    await navigateCommand(projectId, args);
    return { ok: true, path: args.path };
  }
  if (projectId.startsWith("draft:"))
    throw new Error("Draft commands can edit only the open draft.");
  if (projectId === "app")
    throw new Error("Open a project before using workspace actions.");
  if (inlineSession.getSnapshot()?.mode !== "agent")
    throw new Error("Use the command center for workspace actions.");
  if (input.name === "proposePlan") {
    const args = z
      .object({
        title: z.string().min(1).max(80),
        instruction: z.string().min(1).max(3000),
      })
      .parse(input.args);
    const { agentPlans } = await import("@/features/agent/plan-runtime");
    check();
    return agentPlans.propose(
      projectId,
      args.instruction,
      `${input.id}:${input.callId ?? "plan"}`,
      args.title,
    );
  }
  if (!Object.hasOwn(workspaceTools, input.name))
    throw new Error("Unknown command action.");
  const name = input.name as WorkspaceToolName;
  const definition = workspaceTools[name];
  const args = definition.schema.parse(input.args);
  if (definition.mutation) await flushAgentWorkspace(projectId);
  check();
  const revision = await readWorkspaceRevision(projectId);
  check();
  const command = {
    id: input.callId ?? input.id,
    name,
    args,
    revision,
    tokenId: input.id,
  };
  const action = () => {
    check();
    return executeDeviceTool(projectId, command);
  };
  const result = definition.mutation
    ? await runAgentMutation(projectId, action, command)
    : await action();
  check();
  if (result.ok && (name === "listFiles" || name === "searchFiles")) {
    try {
      commandCenter.showFiles(
        projectId,
        name === "listFiles" ? "Files" : "Search results",
        JSON.parse(result.text),
      );
    } catch {
      /* Keep the tool's original result. */
    }
  } else
    commandCenter.show({
      kind: "output",
      projectId,
      title: name,
      text: result.text.slice(0, 8000),
    });
  return result;
};

// Keep retries within one frozen turn from repeating a completed or uncertain mutation.
let receiptOwner = "";
const receipts = new Map<
  string,
  { signature: string; result: Promise<unknown> }
>();
export const executeCommandAction = async (
  projectId: string,
  payload: unknown,
) => {
  const input = z
    .object({
      id: z.string().max(256),
      name: z.string().max(64),
      args: z.unknown(),
      callId: z.string().max(256).optional(),
    })
    .parse(payload);
  const current = inlineSession.getSnapshot();
  if (
    current?.id !== input.id ||
    current.projectId !== projectId ||
    current.status !== "listening"
  )
    throw new Error("Request cancelled or workspace changed.");
  if (!input.callId) return runCommandAction(projectId, input);
  const owner = `${projectId}:${input.id}`;
  if (receiptOwner !== owner) {
    receipts.clear();
    receiptOwner = owner;
  }
  const signature = sha256Hex(
    JSON.stringify({ name: input.name, args: input.args }),
  );
  const existing = receipts.get(input.callId);
  if (existing) {
    if (existing.signature !== signature)
      throw new Error(
        "An action identity was reused with different arguments.",
      );
    return existing.result;
  }
  if (receipts.size >= 64)
    throw new Error(
      "This command reached its action limit. Start another command.",
    );
  const result = runCommandAction(projectId, input);
  receipts.set(input.callId, { signature, result });
  return result;
};
