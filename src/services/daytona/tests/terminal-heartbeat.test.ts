import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { retainTerminalHeartbeat } from "../terminal-heartbeat";

const socket = () =>
  Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN as number,
    ping: vi.fn(),
    terminate: vi.fn(),
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("keeps idle terminal connections active without sending shell input", () => {
  const ws = socket();
  retainTerminalHeartbeat(ws as unknown as WebSocket);
  vi.advanceTimersByTime(20_000);
  expect(ws.ping).toHaveBeenCalledOnce();
  ws.emit("pong");
  vi.advanceTimersByTime(20_000);
  expect(ws.ping).toHaveBeenCalledTimes(2);
  expect(ws.terminate).not.toHaveBeenCalled();
  ws.emit("close");
});

it("terminates an unresponsive connection and releases its timer", () => {
  const ws = socket();
  retainTerminalHeartbeat(ws as unknown as WebSocket);
  vi.advanceTimersByTime(40_000);
  expect(ws.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(ws.listenerCount("pong")).toBe(0);
});

it("cleans up listeners and timers when a terminal closes", () => {
  const ws = socket();
  retainTerminalHeartbeat(ws as unknown as WebSocket);
  ws.emit("close");
  vi.advanceTimersByTime(60_000);
  expect(ws.ping).not.toHaveBeenCalled();
  expect(ws.terminate).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(ws.listenerCount("pong")).toBe(0);
});

it("does not ping a closing socket", () => {
  const ws = socket();
  retainTerminalHeartbeat(ws as unknown as WebSocket);
  ws.readyState = WebSocket.CLOSING;
  vi.advanceTimersByTime(60_000);
  expect(ws.ping).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("releases a socket when sending its heartbeat fails", () => {
  const ws = socket();
  ws.ping.mockImplementation(() => {
    throw new Error("disconnected");
  });
  retainTerminalHeartbeat(ws as unknown as WebSocket);
  vi.advanceTimersByTime(20_000);
  expect(ws.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
