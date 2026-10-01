import { sha256Hex } from "@/lib/hashes";
import { randomUUID } from "expo-crypto";
import { authClient } from "@/lib/auth/auth-client";
import { fetchBase } from "@/lib/utils";
import { inlineSession } from "./inline-session";
import { commandCenter } from "./command-center";
import {
  textCommandResponseSchema,
  type CommandMessageSchema,
} from "./text-command-schemas";
import { readLocalCommand } from "./local-command";
import { formatLocalCommandReply } from "./lib/formatters";

export const sendTextCommand = async (
  projectId: string,
  instruction: string,
  mode: "agent" | "quick-edit",
) => {
  if (!instruction.trim() || commandCenter.getSnapshot().busy) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  const owner = commandCenter.begin(() => {
    controller.abort();
    inlineSession.cancel();
  });
  let requestId: string | undefined;
  const check = () => {
    if (
      controller.signal.aborted ||
      !commandCenter.isCurrent(owner) ||
      (requestId && inlineSession.getSnapshot()?.id !== requestId)
    )
      throw new Error("Command cancelled.");
  };
  try {
    const local = mode === "agent" ? readLocalCommand(instruction) : null;
    const request = await inlineSession.begin(
      projectId,
      mode,
      local ? { captureEditor: false } : undefined,
    );
    requestId = request.id;
    check();
    inlineSession.transcript(instruction);
    commandCenter.segment({
      id: `${request.id}:user`,
      role: "user",
      text: instruction,
      final: true,
    });
    if (local) {
      const { executeCommandAction } = await import("./command-actions");
      await executeCommandAction(projectId, {
        id: request.id,
        name: "navigate",
        args: local,
      });
      check();
      commandCenter.segment({
        id: `${request.id}:assistant`,
        role: "assistant",
        text: formatLocalCommandReply(local),
        final: true,
      });
      inlineSession.receive({ id: request.id, type: "answer" });
      return;
    }
    const { getVoiceContext, readVoiceWorkspace } =
      await import("./voice-workspace");
    const context = getVoiceContext(request);
    const file = request.context?.activeFile;
    let quickEditTarget;
    if (mode === "quick-edit" && file) {
      if (file.to - file.from > 24000)
        throw new Error("Select a smaller section for a quick edit.");
      const source = file.content.replace(/\r\n/g, "\n");
      const offset = Math.max(0, file.from - 800);
      quickEditTarget = {
        source: source.slice(offset, file.to + 800),
        offset,
        caret: file.from,
      };
    }
    const cookie = await authClient.getCookie();
    let messages: CommandMessageSchema[] = [
      { role: "user", content: instruction.trim().slice(0, 4000) },
    ];
    const receipts = new Map<string, { signature: string; output: unknown }>();
    for (let step = 0; step < 8; step++) {
      check();
      const response = await fetchBase("/api/voice/text", {
        method: "POST",
        credentials: "omit",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Cookie: cookie ?? "" },
        body: JSON.stringify({
          context,
          requestId: randomUUID(),
          messages,
          final: step === 7,
          ...(quickEditTarget ? { quickEditTarget } : {}),
        }),
      });
      check();
      if (!response.ok) {
        let message = `Command service unavailable (HTTP ${response.status}).`;
        try {
          const body = await response.json();
          if (typeof body?.message === "string") message = body.message;
        } catch {
          /* A tunnel may return HTML instead of JSON. */
        }
        throw new Error(message);
      }
      const raw = await response.text();
      if (raw.length > 160000)
        throw new Error("This result is too large. Narrow your request.");
      const result = textCommandResponseSchema.parse(JSON.parse(raw));
      check();
      if (result.events) {
        for (const event of result.events) {
          check();
          if (!inlineSession.receive(event))
            throw new Error("Edit request changed. Start again.");
        }
      }
      if (!result.toolCalls.length) {
        if (!result.text.trim())
          throw new Error("The agent returned no answer. Try again.");
        commandCenter.segment({
          id: `${request.id}:assistant`,
          role: "assistant",
          text: result.text,
          final: true,
        });
        if (!result.events)
          inlineSession.receive({ id: request.id, type: "answer" });
        return;
      }
      if (step === 7)
        throw new Error(
          "This command reached its action limit. Review the results before continuing.",
        );
      messages = [...messages, ...result.messages];
      const toolResults: Extract<
        CommandMessageSchema,
        { role: "tool" }
      >["content"] = [];
      for (const call of result.toolCalls) {
        check();
        const signature = sha256Hex(
          JSON.stringify({ name: call.toolName, args: call.input }),
        );
        const receipt = receipts.get(call.toolCallId);
        if (receipt && receipt.signature !== signature)
          throw new Error(
            "An action identity was reused with different arguments.",
          );
        let output = receipt?.output;
        if (!receipts.has(call.toolCallId)) {
          try {
            const payload = {
              id: request.id,
              name: call.toolName,
              args: call.input,
              callId: call.toolCallId,
            };
            if (
              ["readFile", "listFiles", "searchFiles"].includes(call.toolName)
            )
              output = await readVoiceWorkspace(projectId, payload);
            else {
              const { executeCommandAction } =
                await import("./command-actions");
              output = await executeCommandAction(projectId, payload);
            }
          } catch (error) {
            output = {
              ok: false,
              message:
                error instanceof Error ? error.message : "Action failed.",
            };
          }
          receipts.set(call.toolCallId, { signature, output });
        }
        check();
        toolResults.push({
          type: "tool-result",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: {
            type: "json",
            value: JSON.parse(JSON.stringify(output ?? null)),
          },
        });
      }
      messages.push({ role: "tool", content: toolResults });
      quickEditTarget = undefined;
    }
  } catch (error) {
    if (commandCenter.isCurrent(owner)) {
      const message = controller.signal.aborted
        ? "Command timed out. Review any completed actions before trying again."
        : error instanceof Error
          ? error.message
          : "Couldn’t send this command.";
      commandCenter.fail(message, owner);
      if (requestId)
        inlineSession.receive({ id: requestId, type: "error", message });
    }
  } finally {
    clearTimeout(timer);
    commandCenter.finish(owner);
  }
};
