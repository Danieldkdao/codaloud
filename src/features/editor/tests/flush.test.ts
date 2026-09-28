import { expect, it, vi } from "vitest";
import { createEditorFlush } from "../flush";
it("waits for an explicit native acknowledgement and ignores other requests", async () => {
  const send = vi.fn();
  const bridge = createEditorFlush(send);
  let done = false;
  const result = bridge.flush().then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  bridge.acknowledge("old", null);
  expect(done).toBe(false);
  bridge.acknowledge(send.mock.calls[0][0], null);
  await result;
  expect(done).toBe(true);
});
it("rejects failures, lost acknowledgements, and unmounts instead of closing unsaved tabs", async () => {
  vi.useFakeTimers();
  try {
    const send = vi.fn();
    const bridge = createEditorFlush(send);
    const failed = bridge.flush();
    const check = expect(failed).rejects.toThrow("save failed");
    bridge.acknowledge(send.mock.calls[0][0], "save failed");
    await check;
    const lost = bridge.flush();
    const timeout = expect(lost).rejects.toThrow(/respond/);
    await vi.advanceTimersByTimeAsync(5000);
    await timeout;
    const pending = bridge.flush();
    const disposed = expect(pending).rejects.toThrow(/closed/);
    bridge.dispose();
    await disposed;
  } finally {
    vi.useRealTimers();
  }
});
it("re-sends a lost request under the same id and accepts the late acknowledgement", async () => {
  vi.useFakeTimers();
  try {
    const send = vi.fn();
    const bridge = createEditorFlush(send, { attempts: 3, timeout: 1000 });
    let done = false;
    const result = bridge.flush().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(new Set(send.mock.calls.flat()).size).toBe(1);
    bridge.acknowledge(send.mock.calls[1][0], null);
    await result;
    expect(done).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it("gives up only after every attempt has timed out", async () => {
  vi.useFakeTimers();
  try {
    const send = vi.fn();
    const bridge = createEditorFlush(send, { attempts: 3, timeout: 1000 });
    const result = bridge.flush();
    const check = expect(result).rejects.toThrow(/respond/);
    await vi.advanceTimersByTimeAsync(2999);
    expect(send).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    await check;
  } finally {
    vi.useRealTimers();
  }
});
it("stops re-sending once the request is acknowledged", async () => {
  vi.useFakeTimers();
  try {
    const send = vi.fn();
    const bridge = createEditorFlush(send, { attempts: 3, timeout: 1000 });
    const result = bridge.flush();
    bridge.acknowledge(send.mock.calls[0][0], null);
    await result;
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
