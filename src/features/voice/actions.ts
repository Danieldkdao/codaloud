import { editorPreferencesStore } from "@/features/settings/hooks/use-editor-preferences";
import { authClient } from "@/lib/auth/auth-client";
import { fetchBase } from "@/lib/utils";
import { voiceSessionResponseSchema, type VoiceMode } from "./schemas";

export const createVoiceSession = async (
  mode: VoiceMode,
  signal: AbortSignal,
) => {
  try {
    await editorPreferencesStore.load();
    const cookie = await authClient.getCookie();
    if (signal.aborted) return null;
    const response = await fetchBase("/api/voice/session", {
      method: "POST",
      credentials: "omit",
      signal,
      headers: { "Content-Type": "application/json", Cookie: cookie ?? "" },
      body: JSON.stringify({
        mode,
        speechEnabled:
          editorPreferencesStore.getSnapshot().preferences.speechEnabled,
        voiceId: editorPreferencesStore.getSnapshot().preferences.voiceId,
      }),
    });
    if (!response.ok) return null;
    const parsed = voiceSessionResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const deleteVoiceSession = async (roomName: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const cookie = await authClient.getCookie();
    await fetchBase("/api/voice/session", {
      method: "DELETE",
      credentials: "omit",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Cookie: cookie ?? "" },
      body: JSON.stringify({ roomName }),
    });
  } catch {
    /* Room departure and the worker deadline also clean up disconnected sessions. */
  } finally {
    clearTimeout(timer);
  }
};
