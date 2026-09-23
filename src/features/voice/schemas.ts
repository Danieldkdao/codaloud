import { z } from "zod";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";
import { projectFileSearchQuerySchema } from "@/features/projects/actions/file-search-schemas";
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

export const voiceRequestModes = ["agent", "quick-edit"] as const;
export type VoiceRequestMode = (typeof voiceRequestModes)[number];
export const voiceContextSchema = z.object({
  id: z.string().min(1).max(256),
  projectId: z.string().min(1).max(256),
  branch: z.string().max(1024),
  mode: z.enum(voiceRequestModes),
  openFiles: z.array(z.string().max(4096)).max(30),
  openFilesTruncated: z.boolean(),
  activeFile: z
    .object({
      path: projectFilePathSchema,
      documentKey: z.string().max(256),
      revision: z.number().int().nonnegative(),
      from: z.number().int().nonnegative(),
      to: z.number().int().nonnegative(),
      before: z.string().max(800),
      selected: z.string().max(1200),
      after: z.string().max(800),
      selectionTruncated: z.boolean(),
    })
    .nullable(),
});
export type VoiceContextSchema = z.infer<typeof voiceContextSchema>;
export const inlineReadSchema = z.object({
  path: projectFilePathSchema,
  offset: z.number().int().min(0).default(0),
  length: z.number().int().min(1).max(1200).default(1200),
});
export type InlineReadSchema = z.infer<typeof inlineReadSchema>;
export const inlineSearchSchema = projectFileSearchQuerySchema.pick({
  search: true,
  scope: true,
  path: true,
});
export type InlineSearchSchema = z.infer<typeof inlineSearchSchema>;
export const inlineEventKinds = ["start", "complete", "answer"] as const;
export type InlineEventKind = (typeof inlineEventKinds)[number];
export const inlineEventSchema = z.union([
  z.object({ id: z.string().max(256), type: z.enum(inlineEventKinds) }),
  z.object({
    id: z.string().max(256),
    type: z.literal("delta"),
    offset: z.number().int().nonnegative(),
    text: z.string().max(1000),
  }),
  z.object({
    id: z.string().max(256),
    type: z.literal("error"),
    message: z.string().max(1000),
  }),
]);
export type InlineEventSchema = z.infer<typeof inlineEventSchema>;
