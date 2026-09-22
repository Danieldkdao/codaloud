import { z } from "zod";
import {
  defaultEditorPreferences,
  voicePresets,
} from "@/features/settings/constants";

export const voicePreferencesSchema = z.object({
  speechEnabled: z.boolean().default(true),
  voiceId: z
    .string()
    .refine((id) => voicePresets.some((voice) => voice.id === id))
    .default(defaultEditorPreferences.voiceId),
});
export type VoicePreferencesSchema = z.infer<typeof voicePreferencesSchema>;

export const voiceModes = ["hold", "hands-free"] as const;
export type VoiceMode = (typeof voiceModes)[number];
export const voiceSessionRequestSchema = voicePreferencesSchema.extend({
  mode: z.enum(voiceModes),
});
export type VoiceSessionRequestSchema = z.infer<
  typeof voiceSessionRequestSchema
>;
export const voiceSessionResponseSchema = z.object({
  serverUrl: z.url(),
  token: z.string().min(1),
  roomName: z.string().min(1),
  participantIdentity: z.string().min(1),
  mode: z.enum(voiceModes),
});
export type VoiceSessionResponseSchema = z.infer<
  typeof voiceSessionResponseSchema
>;
export const voiceControlActions = [
  "start",
  "commit",
  "cancel",
  "hands-free",
  "stop",
] as const;
export type VoiceControlAction = (typeof voiceControlActions)[number];
export const voiceControlSchema = z.object({
  action: z.enum(voiceControlActions),
});
export type VoiceControlSchema = z.infer<typeof voiceControlSchema>;
