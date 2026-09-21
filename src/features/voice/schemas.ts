import { z } from "zod";

export const voiceModes = ["hold", "hands-free"] as const;
export type VoiceMode = (typeof voiceModes)[number];
export const voiceSessionRequestSchema = z.object({ mode: z.enum(voiceModes) });
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
