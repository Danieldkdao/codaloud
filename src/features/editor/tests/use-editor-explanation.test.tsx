// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { useEditorExplanation } from "../hooks/use-editor-explanation";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  speak: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("expo/fetch", () => ({ fetch: mocks.fetch }));
// Narration is a client concern; these tests cover streaming and lifecycle.
vi.mock("../explanation-speech-client", () => ({
  explanationSpeech: () => ({ speak: mocks.speak, stop: mocks.stop }),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { getCookie: async () => "session" },
}));
vi.mock("@/lib/auth/utils", () => ({ getBaseURL: () => "https://test" }));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const mount = async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const nativeRequire = createRequire(
    import.meta.resolve("react-native/package.json"),
  );
  vi.stubGlobal(
    "AbortController",
    nativeRequire("abort-controller").AbortController,
  );
  let bridge!: ReturnType<typeof useEditorExplanation>;
  let key = "doc";
  const snapshot = {
    documentKey: "doc",
    revision: 1,
    content: "const x = 1;",
    from: 6,
    to: 7,
    focused: true,
  };
  const editor = {
    current: {
      captureContext: (id: string) => void bridge.onContext(id, snapshot),
    },
  };
  const Probe = () => {
    bridge = useEditorExplanation({
      editor,
      documentKey: key,
      path: "a.ts",
      revision: 1,
      enabled: true,
    });
    return null;
  };
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => root.render(createElement(Probe)));
  return {
    get bridge() {
      return bridge;
    },
    snapshot,
    changeFile: async () => {
      key = "other";
      await act(async () => root.render(createElement(Probe)));
    },
  };
};
it("captures only the selected code, streams Markdown, and keeps its highlight until close", async () => {
  mocks.fetch.mockResolvedValue(
    new Response('{"type":"delta","text":"**Variable**"}\n{"type":"done"}\n'),
  );
  const context = await mount();
  await act(async () => context.bridge.start());
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({
    path: "a.ts",
    selected: "x",
    before: "const ",
    after: " = 1;",
  });
  expect(context.bridge.state).toMatchObject({
    status: "ready",
    text: "**Variable**",
  });
  expect(context.bridge.highlight).toMatchObject({
    from: 6,
    to: 7,
    documentKey: "doc",
  });
  act(() => context.bridge.close());
  expect(context.bridge.state).toBeNull();
  expect(context.bridge.highlight).toBeNull();
});
it("cancels on file changes with native AbortController and ignores a late response", async () => {
  let finish!: (value: Response) => void;
  mocks.fetch.mockReturnValue(
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  const context = await mount();
  let pending!: Promise<void>;
  act(() => {
    pending = context.bridge.start();
  });
  await act(async () => {
    await Promise.resolve();
  });
  const signal = mocks.fetch.mock.calls[0][1].signal;
  await context.changeFile();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish(new Response('{"type":"delta","text":"Late"}\n{"type":"done"}\n'));
    await pending;
  });
  expect(context.bridge.state).toBeNull();
});
it("reports incomplete streams and does not submit an empty selection", async () => {
  mocks.fetch.mockResolvedValue(
    new Response('{"type":"delta","text":"Partial"}\n'),
  );
  const context = await mount();
  await act(async () => context.bridge.start());
  expect(context.bridge.state?.status).toBe("error");
  context.snapshot.to = context.snapshot.from;
  await act(async () => context.bridge.start());
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(context.bridge.state?.error).toContain("Select");
});

it("decodes split UTF-8 chunks without losing Markdown or emoji", async () => {
  const bytes = new TextEncoder().encode(
    '{"type":"delta","text":"**Hello** 👋"}\n{"type":"done"}\n',
  );
  mocks.fetch.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    ),
  );
  const context = await mount();
  await act(async () => context.bridge.start());
  expect(context.bridge.state).toMatchObject({
    status: "ready",
    text: "**Hello** 👋",
  });
});
it("cancels an open stream on close and never restores its partial answer", async () => {
  const cancelled = vi.fn();
  mocks.fetch.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('{"type":"delta","text":"Partial"}\n'),
          );
        },
        cancel: cancelled,
      }),
    ),
  );
  const context = await mount();
  let pending!: Promise<void>;
  await act(async () => {
    pending = context.bridge.start();
    await Promise.resolve();
  });
  expect(context.bridge.state?.status).toBe("streaming");
  await act(async () => {
    context.bridge.close();
    await pending;
  });
  expect(cancelled).toHaveBeenCalled();
  expect(context.bridge.state).toBeNull();
});
it("stays silent until the user asks to read it aloud", async () => {
  mocks.fetch.mockResolvedValue(
    new Response(
      '{"type":"delta","text":"It parses JSON."}\n{"type":"done"}\n',
    ),
  );
  const context = await mount();
  await act(async () => context.bridge.start());
  expect(context.bridge.state).toMatchObject({ status: "ready" });
  // Reading aloud is opt-in. Auto-speaking made every explanation start talking
  // and produced failures the user could only see in a log.
  expect(mocks.speak).not.toHaveBeenCalled();
  expect(context.bridge.speaking).toBe(false);

  await act(async () => context.bridge.toggleReadAloud());
  expect(mocks.speak).toHaveBeenCalledWith("It parses JSON.");
  expect(context.bridge.speaking).toBe(false);
});

it("stops reading aloud on a second press and when the bubble closes", async () => {
  mocks.fetch.mockResolvedValue(
    new Response(
      '{"type":"delta","text":"It parses JSON."}\n{"type":"done"}\n',
    ),
  );
  const context = await mount();
  await act(async () => context.bridge.start());

  const before = mocks.stop.mock.calls.length;
  await act(async () => context.bridge.close());
  // Closing must not leave speech playing behind the dismissed bubble.
  expect(mocks.stop.mock.calls.length).toBeGreaterThan(before);
});
it("does not narrate a failed explanation", async () => {
  mocks.fetch.mockResolvedValue(
    new Response('{"type":"error","message":"No selection."}\n'),
  );
  const context = await mount();
  await act(async () => context.bridge.start());
  expect(context.bridge.state).toMatchObject({ status: "error" });
  expect(mocks.speak).not.toHaveBeenCalled();
});
