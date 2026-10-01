import type { VoiceSegment } from "./types";
import { projectFilePathSchema } from "@/features/projects/actions/file-schemas";

export type CommandResult =
  | {
      kind: "files";
      projectId: string;
      title: string;
      entries: { path: string; isDir: boolean }[];
      truncated: boolean;
    }
  | { kind: "output"; projectId: string; title: string; text: string };
type CommandCenterState = {
  input: { projectId: string; mode: "agent" | "quick-edit" } | null;
  result: CommandResult | null;
  transcript: VoiceSegment[];
  busy: boolean;
  error: string | null;
};
const empty = (): CommandCenterState => ({
  input: null,
  result: null,
  transcript: [],
  busy: false,
  error: null,
});
let snapshot = empty();
const listeners = new Set<() => void>();
const publish = (patch: Partial<CommandCenterState>) => {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
};
let cancel: (() => void) | undefined;
let owner = 0;
export const commandCenter = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  open: (projectId = "app", mode: "agent" | "quick-edit" = "agent") =>
    publish({ input: { projectId, mode }, error: null }),
  closeInput: () => publish({ input: null }),
  begin: (onCancel: () => void) => {
    cancel = onCancel;
    publish({ busy: true, error: null, result: null });
    return ++owner;
  },
  isCurrent: (value: number) => value === owner,
  finish: (value?: number) => {
    if (value !== undefined && value !== owner) return;
    cancel = undefined;
    publish({ busy: false });
  },
  fail: (error: string, value?: number) => {
    if (value !== undefined && value !== owner) return;
    publish({ error: error.slice(0, 1000), busy: false });
  },
  segment: (segment: VoiceSegment) =>
    publish({
      transcript: [
        ...snapshot.transcript.filter((entry) => entry.id !== segment.id),
        segment,
      ].slice(-40),
    }),
  show: (result: CommandResult) => publish({ result }),
  showFiles: (projectId: string, title: string, result: unknown) => {
    const data = Array.isArray(result)
      ? result
      : result &&
          typeof result === "object" &&
          "files" in result &&
          Array.isArray(result.files)
        ? result.files
        : [];
    const entries = data.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object" || !("path" in entry)) return [];
      const path = projectFilePathSchema.safeParse(entry.path);
      return path.success
        ? [{ path: path.data, isDir: "isDir" in entry && entry.isDir === true }]
        : [];
    });
    publish({
      result: {
        kind: "files",
        projectId,
        title,
        entries: entries.slice(0, 30),
        truncated:
          entries.length > 30 ||
          Boolean(
            result &&
            typeof result === "object" &&
            (("nextCursor" in result && result.nextCursor) ||
              ("truncated" in result && result.truncated)),
          ),
      },
    });
  },
  clear: () => {
    ++owner;
    cancel?.();
    cancel = undefined;
    snapshot = empty();
    for (const listener of listeners) listener();
  },
};
