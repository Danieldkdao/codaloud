import { z } from "zod";
import { inlineSession } from "./inline-session";
import { inlineReadSchema, type VoiceContextSchema } from "./schemas";
import type { InlineRequest } from "./types";
import { workspaceTools } from "@/features/agent/tools/workspace-tools";
import { collectFileDiagnostics } from "@/features/agent/lib/file-diagnostics";

export const encodeVoicePayload = (value: unknown) => {
  const payload = JSON.stringify(value);
  if (new TextEncoder().encode(payload).length > 12000)
    throw new Error("This result is too large. Narrow the request.");
  return payload;
};
export const getVoiceContext = (request: InlineRequest): VoiceContextSchema => {
  const file = request.context?.activeFile;
  const source = file?.content.replace(/\r\n/g, "\n") ?? "";
  const context: VoiceContextSchema = {
    id: request.id,
    projectId: request.projectId,
    branch: request.context?.branch ?? "",
    mode: request.mode,
    openFiles:
      request.context?.openFiles.map((file) => file.path).slice(0, 30) ?? [],
    openFilesTruncated: (request.context?.openFiles.length ?? 0) > 30,
    activeFile: file
      ? {
          path: file.path,
          documentKey: file.documentKey,
          revision: file.revision,
          from: file.from,
          to: file.to,
          before: source.slice(Math.max(0, file.from - 800), file.from),
          selected: source.slice(
            file.from,
            Math.min(file.to, file.from + 1200),
          ),
          after: source.slice(file.to, file.to + 800),
          selectionTruncated: file.to - file.from > 1200,
        }
      : null,
  };
  while (new TextEncoder().encode(JSON.stringify(context)).length > 12000) {
    if (context.openFiles.length) {
      context.openFiles.pop();
      context.openFilesTruncated = true;
    } else if (
      context.activeFile &&
      (context.activeFile.before ||
        context.activeFile.selected ||
        context.activeFile.after)
    ) {
      context.activeFile.before = "";
      context.activeFile.after = "";
      context.activeFile.selected = "";
      context.activeFile.selectionTruncated =
        context.activeFile.to > context.activeFile.from;
    } else
      throw new Error("Editor path is too long to send. Open a shorter path.");
  }
  return context;
};

export const readVoiceWorkspace = async (
  projectId: string,
  payload: unknown,
) => {
  const input = z
    .object({
      id: z.string().max(256),
      name: z.string().max(32),
      args: z.unknown(),
    })
    .parse(payload);
  const request = inlineSession.getSnapshot();
  const check = () => {
    const current = inlineSession.getSnapshot();
    if (
      !request ||
      current?.id !== request.id ||
      input.id !== request.id ||
      request.projectId !== projectId ||
      !["listening", "generating"].includes(current.status)
    )
      throw new Error("Request cancelled or workspace changed.");
  };
  check();
  const { readProjectFileContentAction, readProjectFilesAction } =
    await import("@/features/projects/actions/file-actions");
  let readingPath: string | undefined;
  try {
    switch (input.name) {
      case "readFile": {
        const args = inlineReadSchema.parse(input.args);
        readingPath = args.path;
        inlineSession.activity(input.id, {
          path: args.path,
          status: "reading",
        });
        const active = request!.context?.activeFile;
        const buffer =
          active?.path === args.path
            ? active
            : request!.context?.openFiles.find(
                (file) => file.path === args.path,
              );
        const file =
          buffer ?? (await readProjectFileContentAction(projectId, args.path));
        check();
        if (!file) throw new Error("The file could not be read.");
        inlineSession.activity(input.id, { path: args.path, status: "read" });
        const content = file.content.replace(/\r\n/g, "\n");
        const diagnostics = await collectFileDiagnostics(
          projectId,
          args.path,
          content,
        );
        check();
        const excerpt = content.slice(args.offset, args.offset + args.length);
        const result = {
          path: args.path,
          source: buffer ? "editor" : "disk",
          offset: args.offset,
          content: excerpt,
          nextOffset:
            args.offset + excerpt.length < content.length
              ? args.offset + excerpt.length
              : null,
          totalLength: content.length,
          diagnostics,
        };
        // Long paths and escaped source can leave less room for diagnostics.
        while (
          new TextEncoder().encode(JSON.stringify(result)).length > 12000 &&
          diagnostics.items.length
        ) {
          diagnostics.items.pop();
          diagnostics.truncated = true;
        }
        while (
          new TextEncoder().encode(JSON.stringify(result)).length > 12000 &&
          result.content.length
        ) {
          result.content = result.content.slice(
            0,
            Math.floor(result.content.length / 2),
          );
          result.nextOffset = args.offset + result.content.length;
        }
        return result;
      }
      case "searchFiles": {
        inlineSession.activity(input.id, "Finding references…");
        const args = workspaceTools.searchFiles.schema.parse(input.args);
        const result = await readProjectFilesAction(projectId, {
          ...args,
          pageSize: Math.min(args.pageSize, 10),
        });
        check();
        if (!result) throw new Error("Search failed.");
        inlineSession.activity(input.id, null);
        const buffers = request!.context?.openFiles ?? [];
        const search = args.search.toLowerCase();
        const openMatches = buffers.filter(
          (file) =>
            (!args.path || file.path.startsWith(`${args.path}/`)) &&
            ((args.scope !== "content" &&
              file.path.toLowerCase().includes(search)) ||
              (args.scope !== "title" &&
                file.content.toLowerCase().includes(search))),
        );
        const files = [
          ...openMatches.map((file) => ({ path: file.path, source: "editor" })),
          ...result.files
            .filter(
              (file) => !buffers.some((buffer) => buffer.path === file.path),
            )
            .map((file) => ({ path: file.path, source: "disk" })),
        ];
        return {
          files: files.slice(0, 10),
          nextCursor: result.nextCursor,
          truncated: files.length > 10 || Boolean(result.nextCursor),
        };
      }
      case "listFiles": {
        inlineSession.activity(input.id, "Browsing files…");
        const args = workspaceTools.listFiles.schema.parse(input.args);
        const files = await readProjectFilesAction(projectId, args);
        check();
        if (!files) throw new Error("The folder could not be read.");
        inlineSession.activity(input.id, null);
        return {
          files: files.slice(0, 30).map(({ path, isDir }) => ({ path, isDir })),
          truncated: files.length > 30,
        };
      }
      default:
        throw new Error("Only read-only voice tools are allowed.");
    }
  } catch (error) {
    if (readingPath)
      inlineSession.activity(input.id, { path: readingPath, status: "failed" });
    throw error;
  } finally {
    inlineSession.activity(input.id, null);
  }
};
