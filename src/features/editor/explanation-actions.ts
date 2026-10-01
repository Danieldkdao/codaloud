import { fetch } from "expo/fetch";
import { randomUUID } from "expo-crypto";
import { authClient } from "@/lib/auth/auth-client";
import { getBaseURL } from "@/lib/auth/utils";
import { BillingRequiredError } from "@/features/billing/client-error";
import {
  explanationEventSchema,
  type ExplanationRequestSchema,
} from "./explanation-schemas";

export const streamEditorExplanation = async (
  input: ExplanationRequestSchema,
  signal: AbortSignal,
  onText: (text: string) => void,
) => {
  const check = () => {
    if (signal.aborted) throw new Error("Explanation cancelled.");
  };
  check();
  const cookie = await authClient.getCookie();
  check();
  const response = await fetch(
    `${getBaseURL().replace(/\/$/, "")}/api/editor/explain`,
    {
      method: "POST",
      credentials: "omit",
      signal,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie ?? "",
        "X-Request-Id": randomUUID(),
      },
      body: JSON.stringify(input),
    },
  );
  check();
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 401
        ? "Sign in to explain code."
        : response.status === 402
          ? new BillingRequiredError().message
          : "Couldn’t connect to the explanation service. Please try again.",
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamCompleted = false;
  let readerCancellation: Promise<void> | null = null;
  const cancelReader = () => {
    if (streamCompleted || readerCancellation) return readerCancellation;
    readerCancellation = reader
      .cancel()
      .then(() => undefined)
      .catch(() => {});
    return readerCancellation;
  };
  const abort = () => {
    void cancelReader();
  };
  signal.addEventListener("abort", abort, { once: true });
  let buffer = "";
  let text = "";
  let receivedDone = false;
  try {
    while (true) {
      check();
      const next = await reader.read();
      if (next.done) streamCompleted = true;
      check();
      buffer += next.done
        ? decoder.decode()
        : decoder.decode(next.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        if (newline > 100000)
          throw new Error("Explanation response too large.");
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = explanationEventSchema.parse(JSON.parse(line));
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") {
          if (!text.trim())
            throw new Error("No explanation was returned. Please try again.");
          receivedDone = true;
          continue;
        }
        if (receivedDone)
          throw new Error("The explanation stream was interrupted.");
        text += event.text;
        if (text.length > 16000)
          throw new Error("Explanation response too large.");
        onText(text);
      }
      if (buffer.length > 100000)
        throw new Error("Explanation response too large.");
      if (next.done) {
        if (receivedDone) return;
        throw new Error("The explanation was interrupted. Please try again.");
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    if (!streamCompleted) await cancelReader();
    reader.releaseLock();
  }
};
