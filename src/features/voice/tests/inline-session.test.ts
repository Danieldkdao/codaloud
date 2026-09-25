import { expect, it, vi } from "vitest";
import { createInlineSession } from "../inline-session";

const context = () => ({
  projectId: "project",
  branch: "main",
  openFiles: [{ path: "a.ts", content: "hello" }],
  activeFile: {
    path: "a.ts",
    documentKey: "doc",
    revision: 1,
    content: "hello",
    from: 1,
    to: 4,
    focused: true,
  },
});
const setup = () => {
  let content = "hello";
  const capture = vi.fn(async () => ({
    ...context(),
    activeFile: { ...context().activeFile, content },
  }));
  const preview = vi.fn((value) => {
    content =
      value && value.status !== "listening" ? "h" + value.text + "o" : "hello";
  });
  const apply = vi.fn(async () => true);
  const session = createInlineSession();
  session.register("project", { capture, preview, apply });
  return { session, capture, preview, apply };
};
it("keeps explicit inline intent after focus changes and permits a follow-up to replace a ready preview", async () => {
  const { session, capture, apply } = setup();
  capture.mockResolvedValue({
    ...context(),
    activeFile: { ...context().activeFile, focused: false },
  });
  const first = await session.begin("project", "quick-edit");
  expect(first.mode).toBe("quick-edit");
  session.receive({ id: first.id, type: "start" });
  session.receive({ id: first.id, type: "delta", offset: 0, text: "world" });
  session.receive({ id: first.id, type: "complete" });
  const next = await session.begin("project", "quick-edit");
  expect(next.mode).toBe("quick-edit");
  expect(next.id).not.toBe(first.id);
  expect(
    session.receive({ id: first.id, type: "delta", offset: 5, text: "late" }),
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});
it("freezes the target and accepts only the exact completed streamed document", async () => {
  const { session, capture, preview, apply } = setup();
  const request = await session.begin("project");
  session.receive({ id: request.id, type: "start" });
  session.receive({ id: request.id, type: "delta", offset: 0, text: "world" });
  expect(preview.mock.lastCall?.[0].text).toBe("world");
  await session.accept(request.id);
  expect(apply).not.toHaveBeenCalled();
  session.receive({ id: request.id, type: "complete" });
  capture.mockResolvedValueOnce({
    ...context(),
    activeFile: {
      ...context().activeFile,
      content: "hworldo",
      revision: 5,
      from: 0,
      to: 0,
      focused: false,
    },
  });
  await session.accept(request.id);
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({ id: request.id, text: "world", from: 1, to: 4 }),
    request.context,
  );
});
it("rejects a changed document revision or branch and ignores cancelled or late updates", async () => {
  const { session, capture, apply } = setup();
  const first = await session.begin("project");
  session.cancel();
  expect(session.receive({ id: first.id, type: "start" })).toBe(false);
  const second = await session.begin("project");
  session.receive({ id: second.id, type: "start" });
  session.receive({ id: second.id, type: "complete" });
  capture.mockResolvedValueOnce({ ...context(), branch: "other" });
  await session.accept(second.id);
  expect(apply).not.toHaveBeenCalled();
  expect(session.getSnapshot()?.error).toMatch(/changed/);
});
it("does not resurrect a cancelled context capture or redirect a preview to a new tab", async () => {
  const { session, capture, apply } = setup();
  let resolve!: (value: ReturnType<typeof context>) => void;
  capture.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = session.begin("project");
  session.cancel();
  resolve(context());
  await expect(pending).rejects.toThrow(/cancel/i);
  expect(session.getSnapshot()).toBeNull();
  const next = await session.begin("project");
  session.receive({ id: next.id, type: "start" });
  session.receive({ id: next.id, type: "complete" });
  capture.mockResolvedValueOnce({
    ...context(),
    activeFile: { ...context().activeFile, documentKey: "other" },
  });
  await session.accept(next.id);
  expect(apply).not.toHaveBeenCalled();
});
it("answers questions without generating previews and refuses duplicate or out of order chunks", async () => {
  const { session, apply } = setup();
  const request = await session.begin("project");
  session.receive({ id: request.id, type: "answer" });
  expect(session.receive({ id: request.id, type: "start" })).toBe(false);
  await session.accept(request.id);
  expect(apply).not.toHaveBeenCalled();
  const next = await session.begin("project");
  session.receive({ id: next.id, type: "start" });
  expect(() =>
    session.receive({ id: next.id, type: "delta", offset: 3, text: "x" }),
  ).toThrow(/order/);
});
it("rejects an empty caret insertion while allowing an explicit selection deletion", async () => {
  const { session, capture } = setup();
  capture.mockResolvedValueOnce({
    ...context(),
    activeFile: { ...context().activeFile, from: 2, to: 2 },
  });
  const request = await session.begin("project");
  session.receive({ id: request.id, type: "start" });
  session.receive({ id: request.id, type: "complete" });
  expect(session.getSnapshot()?.status).toBe("error");
  session.cancel();
  const deletion = await session.begin("project");
  session.receive({ id: deletion.id, type: "start" });
  session.receive({ id: deletion.id, type: "complete" });
  expect(session.getSnapshot()?.status).toBe("ready");
});
it("survives 250 cancel and restart cycles with delayed updates and revision changes", async () => {
  const { session, apply } = setup();
  let oldId = "old";
  for (let index = 0; index < 250; index++) {
    const request = await session.begin("project");
    expect(session.receive({ id: oldId, type: "error", message: "late" })).toBe(
      false,
    );
    session.receive({ id: request.id, type: "start" });
    session.receive({ id: request.id, type: "delta", offset: 0, text: "new" });
    if (index % 2) session.invalidate("doc", 2);
    else session.cancel();
    expect(session.receive({ id: request.id, type: "complete" })).toBe(false);
    await session.accept(request.id);
    oldId = request.id;
  }
  expect(apply).not.toHaveBeenCalled();
});

it("does not invalidate its own streamed document updates", async () => {
  const { session } = setup();
  const request = await session.begin("project");
  session.receive({ id: request.id, type: "start" });
  session.receive({ id: request.id, type: "delta", offset: 0, text: "world" });
  session.invalidate("doc", 2, request.id);
  expect(session.getSnapshot()?.status).toBe("generating");
  session.invalidate("other", 2, request.id);
  expect(session.getSnapshot()?.status).toBe("error");
});
it("replaces an exact target around a caret instead of appending a correction", async () => {
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const { bytesToHex } = await import("@noble/hashes/utils.js");
  const source = "const n = Math.floor(Math.random * 10);";
  const oldText = "Math.random";
  const from = source.indexOf(oldText);
  const { session, capture, preview, apply } = setup();
  capture.mockResolvedValue({
    ...context(),
    activeFile: {
      ...context().activeFile,
      content: source,
      from: source.length,
      to: source.length,
    },
  });
  const request = await session.begin("project");
  session.receive({ id: request.id, type: "start" });
  session.receive({
    id: request.id,
    type: "target",
    from,
    to: from + oldText.length,
    originalHash: bytesToHex(sha256(new TextEncoder().encode(oldText))),
  });
  session.receive({
    id: request.id,
    type: "delta",
    offset: 0,
    text: "Math.random()",
  });
  session.receive({ id: request.id, type: "complete" });
  expect(preview.mock.lastCall?.[0]).toMatchObject({
    from,
    to: from + oldText.length,
    text: "Math.random()",
  });
  capture.mockResolvedValue({
    ...context(),
    activeFile: {
      ...context().activeFile,
      content: source.replace(oldText, "Math.random()"),
      revision: 3,
    },
  });
  await session.accept(request.id);
  expect(apply).toHaveBeenCalledOnce();
});
it("rejects a mismatched target before any streamed code is applied", async () => {
  const { session, preview } = setup();
  const request = await session.begin("project");
  session.receive({ id: request.id, type: "start" });
  expect(() =>
    session.receive({
      id: request.id,
      type: "target",
      from: 0,
      to: 5,
      originalHash: "0".repeat(64),
    }),
  ).toThrow(/changed|match/i);
  expect(preview.mock.lastCall?.[0].text).toBe("");
});
