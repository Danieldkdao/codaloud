import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { InlineEvent, InlineRequest, VoiceEditorBridge } from "./types";
import type { InlineSuggestion } from "@/features/editor/types";
import { mergeFileActivity } from "@/features/agent/file-activity";
import type { FileActivitySchema } from "@/features/agent/schemas";

export const createInlineSession = () => {
  const editors = new Map<string, VoiceEditorBridge>();
  const listeners = new Set<() => void>();
  let request: InlineRequest | null = null;
  let owner: VoiceEditorBridge | undefined;
  let sequence = 0;
  const publish = (next: InlineRequest | null) => {
    request = next;
    listeners.forEach((listener) => listener());
  };
  const suggestion = (value: InlineRequest): InlineSuggestion => ({
    id: value.id,
    from: value.range?.from ?? value.context!.activeFile!.from,
    to: value.range?.to ?? value.context!.activeFile!.to,
    text: value.text,
    transcript: value.transcript,
    status:
      value.status === "ready"
        ? "ready"
        : value.status === "listening"
          ? "listening"
          : "generating",
  });
  const clearPreview = () => {
    if (request?.context) owner?.preview(null, request.context);
  };
  const cancel = () => {
    clearPreview();
    publish(null);
  };
  const fail = (id: string, message: string) => {
    if (request?.id !== id) return;
    clearPreview();
    publish({ ...request, status: "error", error: message });
  };
  return {
    getSnapshot: () => request,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    register: (projectId: string, bridge: VoiceEditorBridge) => {
      editors.set(projectId, bridge);
      return () => {
        if (editors.get(projectId) === bridge) editors.delete(projectId);
        if (owner === bridge) cancel();
      };
    },
    begin: async (projectId: string, requestedMode?: InlineRequest["mode"]) => {
      if (request && ["generating", "applying"].includes(request.status))
        throw new Error(
          "Accept, decline, or cancel the current suggestion first.",
        );
      clearPreview();
      const id = `${Date.now()}-${++sequence}`;
      owner = editors.get(projectId);
      const bridge = owner;
      publish({
        id,
        projectId,
        context: null,
        mode: "agent",
        status: "listening",
        text: "",
        transcript: "",
      });
      try {
        const captured = (await bridge?.capture()) ?? null;
        if (request?.id !== id || owner !== bridge)
          throw new Error("Request cancelled.");
        // Deep copy: live tab arrays and document objects must never retarget a turn.
        const context = captured
          ? (JSON.parse(JSON.stringify(captured)) as typeof captured)
          : null;
        if (requestedMode === "quick-edit" && !context?.activeFile)
          throw new Error("Open a file before requesting an inline edit.");
        const mode =
          requestedMode ??
          (context?.activeFile?.focused ? "quick-edit" : "agent");
        publish({ ...request, context, mode });
        if (mode === "quick-edit")
          bridge?.preview(suggestion(request!), context!);
        return request!;
      } catch (error) {
        fail(
          id,
          error instanceof Error ? error.message : "Editor unavailable.",
        );
        throw error;
      }
    },
    transcript: (text: string) => {
      if (request?.status !== "listening") return;
      publish({ ...request, transcript: text.slice(-4000) });
      if (request!.mode === "quick-edit")
        owner?.preview(suggestion(request!), request!.context!);
    },
    activity: (id: string, value: FileActivitySchema | string | null) => {
      if (request?.id !== id) return;
      publish(
        typeof value === "string" || value === null
          ? { ...request, toolActivity: value ?? undefined }
          : {
              ...request,
              files: mergeFileActivity(request.files ?? [], value),
            },
      );
    },
    receive: (event: InlineEvent) => {
      if (
        request?.id !== event.id ||
        !["listening", "generating"].includes(request.status)
      )
        return false;
      switch (event.type) {
        case "start":
          if (request.mode !== "quick-edit" || request.status !== "listening")
            return false;
          publish({
            ...request,
            status: "generating",
            files: mergeFileActivity(request.files ?? [], {
              path: request.context!.activeFile!.path,
              status: "proposed",
            }),
          });
          break;
        case "target": {
          const source = request.context?.activeFile?.content.replace(
            /\r\n/g,
            "\n",
          );
          if (
            request.status !== "generating" ||
            request.range ||
            request.text ||
            source === undefined ||
            !Number.isInteger(event.from) ||
            !Number.isInteger(event.to) ||
            event.from < 0 ||
            event.to < event.from ||
            event.to > source.length ||
            event.to - event.from > 24000 ||
            bytesToHex(
              sha256(
                new TextEncoder().encode(source.slice(event.from, event.to)),
              ),
            ) !== event.originalHash
          )
            throw new Error(
              "The edit target does not match the captured file.",
            );
          publish({ ...request, range: { from: event.from, to: event.to } });
          break;
        }
        case "delta":
          if (
            request.status !== "generating" ||
            event.offset !== request.text.length
          )
            throw new Error("Suggestion stream arrived out of order.");
          if (request.text.length + event.text.length > 24000)
            throw new Error("Suggestion is too large. Request a smaller edit.");
          publish({ ...request, text: request.text + event.text });
          break;
        case "complete":
          if (request.status !== "generating") return false;
          if (
            !request.text &&
            (request.range?.from ?? request.context?.activeFile?.from) ===
              (request.range?.to ?? request.context?.activeFile?.to)
          ) {
            fail(event.id, "No code was suggested. Cancel and try again.");
            return true;
          }
          publish({ ...request, status: "ready" });
          break;
        case "answer":
          if (request.status !== "listening") return false;
          clearPreview();
          publish({ ...request, status: "answered", toolActivity: undefined });
          return true;
        case "error":
          fail(event.id, event.message);
          return true;
      }
      if (request!.mode === "quick-edit")
        owner?.preview(suggestion(request!), request!.context!);
      return true;
    },
    invalidate: (
      documentKey?: string,
      revision?: number,
      inlineSuggestionId?: string,
    ) => {
      const file = request?.context?.activeFile;
      if (
        file &&
        request?.mode === "quick-edit" &&
        request &&
        ["listening", "generating", "ready"].includes(request.status) &&
        (file.documentKey !== documentKey ||
          (file.revision !== revision && inlineSuggestionId !== request.id))
      )
        fail(request.id, "The document changed. Cancel and start again.");
    },
    accept: async (id: string) => {
      if (
        request?.id !== id ||
        request.status !== "ready" ||
        !owner ||
        !request.context?.activeFile
      )
        return;
      const original = request;
      const bridge = owner;
      publish({ ...request, status: "applying" });
      try {
        const current = await bridge.capture();
        if (request?.id !== id) return;
        const before = original.context!.activeFile!;
        const after = current.activeFile;
        // CodeMirror offsets use LF even when the saved file uses CRLF.
        const source = before.content.replace(/\r\n/g, "\n");
        const range = original.range ?? before;
        const expected =
          source.slice(0, range.from) +
          original.text.replace(/\r\n/g, "\n") +
          source.slice(range.to);
        if (
          current.projectId !== original.projectId ||
          current.branch !== original.context!.branch ||
          !after ||
          after.documentKey !== before.documentKey ||
          after.content.replace(/\r\n/g, "\n") !== expected
        )
          throw new Error(
            "The document or branch changed. Cancel and start again.",
          );
        if (!(await bridge.apply(suggestion(original), original.context!)))
          throw new Error("The visible suggestion changed. Start again.");
        if (request?.id === id) {
          clearPreview();
          publish({
            ...request,
            status: "accepted",
            files: mergeFileActivity(request.files ?? [], {
              path: original.context!.activeFile!.path,
              status: "changed",
            }),
          });
        }
      } catch (error) {
        fail(
          id,
          error instanceof Error
            ? error.message
            : "Could not accept suggestion.",
        );
      }
    },
    cancel,
  };
};

export const inlineSession = createInlineSession();
