import { expect, it, vi } from "vitest";
import { createInlineVoiceTools } from "../inline-voice-tools";
import type { VoiceContextSchema } from "@/features/voice/schemas";

const context = (projectId: string): VoiceContextSchema => ({
  id: "request",
  projectId,
  branch: "",
  mode: "quick-edit",
  openFiles: ["idea.py"],
  openFilesTruncated: false,
  activeFile: {
    path: "idea.py",
    documentKey: "document",
    revision: 1,
    from: 0,
    to: 0,
    before: "",
    selected: "",
    after: "print(1)",
    selectionTruncated: false,
  },
});

it("exposes only the open-file read tool in draft voice", () => {
  const rpc = vi.fn();
  expect(
    Object.keys(createInlineVoiceTools(context("draft:123"), rpc)),
  ).toEqual(["readFile"]);
  expect(Object.keys(createInlineVoiceTools(context("project"), rpc))).toEqual([
    "navigate",
    "readFile",
    "openFile",
    "listFiles",
    "searchFiles",
  ]);
});

it("offers no voice tools outside a project or draft", () => {
  expect(Object.keys(createInlineVoiceTools(context("app"), vi.fn()))).toEqual(
    [],
  );
});
