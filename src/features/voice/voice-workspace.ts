import { z } from "zod";
import { sha256Hex } from "@/lib/hashes";
import { inlineSession } from "./inline-session";
import { commandCenter } from "./command-center";
import { inlineReadSchema, type VoiceContextSchema } from "./schemas";
import type { InlineRequest } from "./types";
import { workspaceTools } from "@/features/agent/tools/workspace-tools";
import { collectFileDiagnostics } from "@/features/agent/lib/file-diagnostics";
import { editorPreferencesStore } from "@/features/settings/hooks/use-editor-preferences";
import {
  parsePathRules,
  pathMatchesRule,
  pathRulesAreValid,
} from "@/features/settings/lib/path-rules";

const disabledPaths = () => {
  const text = editorPreferencesStore.getSnapshot().preferences.aiDisabledPaths;
  if (!pathRulesAreValid(text))
    throw new Error(
      "Invalid Disabled Files / Folders list. Fix it in Editor Settings before using AI.",
    );
  return parsePathRules(text);
};

export const encodeVoicePayload = (value: unknown) => {
  let payload = JSON.stringify(value);
  if (
    new TextEncoder().encode(payload).length > 12000 &&
    value &&
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string"
  ) {
    const bounded = { ...value, text: value.text, truncated: true };
    if ("changedFiles" in bounded && Array.isArray(bounded.changedFiles))
      bounded.changedFiles = bounded.changedFiles.slice(0, 30);
    for (;;) {
      payload = JSON.stringify(bounded);
      if (new TextEncoder().encode(payload).length <= 12000) break;
      if (bounded.text.length)
        bounded.text = bounded.text.slice(
          0,
          Math.floor(bounded.text.length / 2),
        );
      else if (
        "changedFiles" in bounded &&
        Array.isArray(bounded.changedFiles) &&
        bounded.changedFiles.length
      )
        bounded.changedFiles = bounded.changedFiles.slice(
          0,
          Math.floor(bounded.changedFiles.length / 2),
        );
      else break;
    }
  }
  if (new TextEncoder().encode(payload).length > 12000)
    throw new Error("This result is too large. Narrow the request.");
  return payload;
};
export const getVoiceContext = (request: InlineRequest): VoiceContextSchema => {
  const file = request.context?.activeFile;
  const disabled = disabledPaths();
  if (file && pathMatchesRule(file.path, disabled))
    throw new Error("This file is disabled for AI in Editor Settings.");
  const source = file?.content.replace(/\r\n/g, "\n") ?? "";
  const context: VoiceContextSchema = {
    inlineModel: editorPreferencesStore.getSnapshot().preferences.inlineModel,
    id: request.id,
    projectId: request.projectId,
    branch: request.context?.branch ?? "",
    mode: request.mode,
    openFiles:
      request.context?.openFiles
        .filter((file) => !pathMatchesRule(file.path, disabled))
        .map((file) => file.path)
        .slice(0, 30) ?? [],
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
  await editorPreferencesStore.load();
  const disabled = disabledPaths();
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
  const checkPath = (path: string) => {
    if (path && pathMatchesRule(path, disabled))
      throw new Error(
        "This file or folder is disabled for AI in Editor Settings.",
      );
  };
  if (projectId.startsWith("draft:")) {
    if (input.name !== "readFile")
      throw new Error("Draft voice can read only the open draft.");
    const args = inlineReadSchema.parse(input.args);
    checkPath(args.path);
    const active = request!.context?.activeFile;
    if (!active || args.path !== active.path)
      throw new Error("Draft voice can read only the open draft.");
    const content = active.content.replace(/\r\n/g, "\n");
    const excerpt = content.slice(args.offset, args.offset + args.length);
    return {
      path: active.path,
      source: "editor",
      offset: args.offset,
      content: excerpt,
      nextOffset:
        args.offset + excerpt.length < content.length
          ? args.offset + excerpt.length
          : null,
      totalLength: content.length,
      diagnostics: {
        engine: "none",
        status: "unsupported",
        items: [],
        total: null,
        truncated: false,
      },
    };
  }
  const { readProjectFileContentAction, readProjectFilesAction } =
    await import("@/features/projects/actions/file-actions");
  let readingPath: string | undefined;
  try {
    switch (input.name) {
      case "readFile": {
        const args = inlineReadSchema.parse(input.args);
        checkPath(args.path);
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
        const content =
          request!.mode === "agent"
            ? file.content
            : file.content.replace(/\r\n/g, "\n");
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
          contentHash: sha256Hex(file.content),
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
        if (request?.mode === "agent")
          commandCenter.show({
            kind: "output",
            projectId,
            title: args.path,
            text: result.content.slice(0, 8000),
          });
        return result;
      }
      case "searchFiles": {
        inlineSession.activity(input.id, "Finding references…");
        const args = workspaceTools.searchFiles.schema.parse(input.args);
        checkPath(args.path);
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
            !pathMatchesRule(file.path, disabled) &&
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
              (file) =>
                !pathMatchesRule(file.path, disabled) &&
                !buffers.some((buffer) => buffer.path === file.path),
            )
            .map((file) => ({ path: file.path, source: "disk" })),
        ];
        const response = {
          files: files.slice(0, 10),
          nextCursor: result.nextCursor,
          truncated: files.length > 10 || Boolean(result.nextCursor),
        };
        commandCenter.showFiles(projectId, "Search results", response);
        return response;
      }
      case "listFiles": {
        inlineSession.activity(input.id, "Browsing files…");
        const args = workspaceTools.listFiles.schema.parse(input.args);
        checkPath(args.path);
        const files = await readProjectFilesAction(projectId, args);
        check();
        if (!files) throw new Error("The folder could not be read.");
        inlineSession.activity(input.id, null);
        const response = {
          files: files
            .filter(({ path }) => !pathMatchesRule(path, disabled))
            .slice(0, 30)
            .map(({ path, isDir }) => ({ path, isDir })),
          truncated: files.length > 30,
        };
        commandCenter.showFiles(projectId, "Files", response);
        return response;
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
