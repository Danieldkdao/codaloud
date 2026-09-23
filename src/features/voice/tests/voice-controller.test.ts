import { expect, it, vi } from "vitest";
import { createVoiceController } from "../voice-controller";

const setup = () => {
  const connection = {
    control: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const connect = vi.fn().mockResolvedValue(connection);
  return { connection, connect, controller: createVoiceController(connect) };
};
it("commits a held turn once and keeps the room for the reply and next turn", async () => {
  const { controller, connection, connect } = setup();
  await controller.start("hold");
  await controller.release();
  await controller.release();
  expect(connection.control.mock.calls.map(([action]) => action)).toEqual([
    "start",
    "commit",
  ]);
  expect(controller.getSnapshot().listening).toBe(false);
  expect(connection.close).not.toHaveBeenCalled();
  await controller.start("hold");
  expect(connect).toHaveBeenCalledOnce();
  await controller.stop();
});
it("switches into hands-free and closes when stopped", async () => {
  const { controller, connection } = setup();
  await controller.start("hands-free");
  await controller.release();
  expect(connection.control).toHaveBeenCalledExactlyOnceWith("hands-free");
  await controller.stop();
  expect(connection.close).toHaveBeenCalledOnce();
  expect(controller.getSnapshot().connection).toBe("idle");
});
it("release while connecting never enables a late microphone", async () => {
  const { controller, connection, connect } = setup();
  let finish!: (value: typeof connection) => void;
  connect.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const starting = controller.start("hold");
  await Promise.resolve();
  await controller.release();
  expect(connect.mock.calls[0]![1].aborted).toBe(true);
  finish(connection);
  await starting;
  expect(connection.control).not.toHaveBeenCalled();
  expect(connection.close).toHaveBeenCalledOnce();
});
it("reports connection failures and can retry", async () => {
  const { controller, connect } = setup();
  connect.mockRejectedValueOnce(
    new Error("Microphone permission is required."),
  );
  await controller.start("hold");
  expect(controller.getSnapshot().error).toBe(
    "Microphone permission is required.",
  );
  await controller.start("hands-free");
  expect(controller.getSnapshot().listening).toBe(true);
  await controller.stop();
});
it("ignores old room events after stop", async () => {
  const { controller, connect } = setup();
  await controller.start("hands-free");
  const events = connect.mock.calls[0]![2];
  await controller.stop();
  events.onSegment({ id: "old", role: "user", text: "late", final: true });
  expect(controller.getSnapshot().transcript).toEqual([]);
});

it("pauses capture while preserving the transcript and session for resuming", async () => {
  const { controller, connection, connect } = setup();
  await controller.start("hands-free");
  const events = connect.mock.calls[0]![2];
  const segment = { id: "one", role: "user", text: "Hello", final: true };
  events.onSegment(segment);
  await controller.pause();
  expect(connection.control).toHaveBeenLastCalledWith("stop");
  expect(connection.close).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    connection: "connected",
    mode: null,
    listening: false,
    transcript: [segment],
  });
  await controller.start("hands-free");
  expect(connect).toHaveBeenCalledOnce();
  expect(controller.getSnapshot().transcript).toEqual([segment]);
  await controller.stop();
});
it("captures the request before connecting and ignores capture completion after stop", async () => {
  let finish!: () => void;
  const capture = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const connect = vi.fn();
  const controller = createVoiceController(connect, capture);
  const started = controller.start("hold");
  expect(capture).toHaveBeenCalledOnce();
  expect(connect).not.toHaveBeenCalled();
  await controller.stop();
  finish();
  await started;
  expect(connect).not.toHaveBeenCalled();
});
