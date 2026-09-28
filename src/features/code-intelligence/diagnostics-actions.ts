import { fetch } from "expo/fetch";
import { authClient } from "@/lib/auth/auth-client";
import { getBaseURL } from "@/lib/auth/utils";
import {
  remoteDiagnosticsRequestSchema,
  remoteDiagnosticsResultSchema,
  type RemoteDiagnosticsRequestSchema,
  type RemoteDiagnosticsResultSchema,
} from "./diagnostics-schemas";

/** The only way a Hermes host (no WebAssembly) gets wasm-analyzer diagnostics;
 * returns null when cancelled or failed, which the caller reads as unavailable. */
export const requestRemoteDiagnostics = async (
  input: RemoteDiagnosticsRequestSchema,
  signal?: AbortSignal,
): Promise<RemoteDiagnosticsResultSchema | null> => {
  if (signal?.aborted) return null;
  const parsed = remoteDiagnosticsRequestSchema.safeParse(input);
  if (!parsed.success) return null;
  const cookie = await authClient.getCookie();
  if (signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(
      `${getBaseURL().replace(/\/$/, "")}/api/editor/diagnostics`,
      {
        method: "POST",
        credentials: "omit",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Cookie: cookie ?? "" },
        body: JSON.stringify(parsed.data),
      },
    );
    if (!response.ok) return null;
    return (
      remoteDiagnosticsResultSchema.safeParse(await response.json()).data ??
      null
    );
  } catch {
    return null;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
};
