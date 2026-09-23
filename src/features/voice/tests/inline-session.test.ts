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
  const capture = vi.fn(async () => context());
  const preview = vi.fn();
  const apply = vi.fn(async () => true);
  const session = createInlineSession();
  session.register("project", { capture, preview, apply });
  return { session, capture, preview, apply };
};
it("freezes the target, preserves code while streaming and applies only a completed preview", async () => {
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
    activeFile: { ...context().activeFile, from: 0, to: 0, focused: false },
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
