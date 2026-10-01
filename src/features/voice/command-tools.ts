import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { workspaceTools } from "@/features/agent/tools/workspace-tools";
import {
  inlineReadSchema,
  inlineSearchSchema,
  type VoiceContextSchema,
} from "./schemas";
import {
  commandNavigationSchema,
  commandOpenFileSchema,
} from "./command-navigation";

export const createCommandTools = (
  context: VoiceContextSchema,
  rpc?: (method: string, payload: unknown) => Promise<unknown>,
): ToolSet => {
  const define = (
    name: string,
    description: string,
    inputSchema: z.ZodType<unknown>,
    method = "codaloud.voice.action",
  ) =>
    rpc
      ? tool<unknown, unknown, Record<string, unknown>>({
          description,
          inputSchema,
          execute: (args, options) =>
            rpc(method, {
              id: context.id,
              name,
              args,
              callId: options.toolCallId,
            }),
        })
      : tool<unknown, Record<string, unknown>>({ description, inputSchema });
  if (context.projectId === "app") return {};
  const tools: ToolSet = {
    navigate: define(
      "navigate",
      "Open or close a panel inside the current project. Back returns to this project’s editor. Commands cannot switch resources or open account, subscription or app settings. Navigation alone changes no files.",
      commandNavigationSchema,
    ),
  };
  tools.readFile = define(
    "readFile",
    "Read a bounded excerpt from a file using frozen unsaved editor contents when available, with diagnostics and contentHash. For project writes, copy contentHash exactly into saveFile or editFile expectedContentHash; it identifies the whole file, not just this excerpt, and is not a Git revision. Agent reads preserve exact whitespace and line endings. Follow nextOffset for more; offsets are zero-based UTF-16 characters. Read all content before replacing a whole file; never invent a hash.",
    inlineReadSchema,
    "codaloud.voice.read",
  );
  if (context.projectId.startsWith("draft:"))
    return { readFile: tools.readFile };
  tools.openFile = define(
    "openFile",
    "Open a validated project file in the editor. List or search first if the path is unknown.",
    commandOpenFileSchema,
  );
  tools.listFiles = define(
    "listFiles",
    workspaceTools.listFiles.description,
    workspaceTools.listFiles.schema,
    "codaloud.voice.read",
  );
  tools.searchFiles = define(
    "searchFiles",
    workspaceTools.searchFiles.description,
    inlineSearchSchema,
    "codaloud.voice.read",
  );
  if (context.mode !== "agent") return tools;
  for (const [name, definition] of Object.entries(workspaceTools)) {
    if (["readFile", "listFiles", "searchFiles"].includes(name)) continue;
    tools[name] = define(name, definition.description, definition.schema);
  }
  tools.proposePlan = define(
    "proposePlan",
    "Present a substantial implementation plan for review outside the bubble. This does not start work. The user approves the plan in the existing review panel.",
    z.strictObject({
      title: z.string().min(1).max(80),
      instruction: z.string().min(1).max(3000),
    }),
  );
  return tools;
};
