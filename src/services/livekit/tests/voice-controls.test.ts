import { expect, it, vi } from "vitest";
import { createVoiceControlHandler } from "../voice-controls";
const setup = () => {
  const session = {
    input: { setAudioEnabled: vi.fn() },
    interrupt: vi.fn(),
    clearUserTurn: vi.fn(),
    commitUserTurn: vi.fn(),
    updateOptions: vi.fn(),
  };
  return { session, handle: createVoiceControlHandler(session, "owner") };
};
it("holds a manual turn until release and ignores duplicate releases", async () => {
  const { session, handle } = setup();
  await handle("owner", JSON.stringify({ action: "start" }));
  expect(session.updateOptions).toHaveBeenCalledWith({
    turnHandling: { turnDetection: "manual" },
  });
  expect(session.input.setAudioEnabled).toHaveBeenLastCalledWith(true);
  expect(session.commitUserTurn).not.toHaveBeenCalled();
  await handle("owner", JSON.stringify({ action: "commit" }));
  await handle("owner", JSON.stringify({ action: "commit" }));
  expect(session.input.setAudioEnabled).toHaveBeenLastCalledWith(false);
  expect(session.commitUserTurn).toHaveBeenCalledOnce();
});
it("hands-free enables automatic turns and stop disables audio", async () => {
  const { session, handle } = setup();
  await handle("owner", JSON.stringify({ action: "hands-free" }));
  expect(session.updateOptions).toHaveBeenLastCalledWith({
    turnHandling: { turnDetection: "stt" },
  });
  await handle("owner", JSON.stringify({ action: "stop" }));
  expect(session.input.setAudioEnabled).toHaveBeenLastCalledWith(false);
  expect(session.clearUserTurn).toHaveBeenCalled();
  expect(session.commitUserTurn).not.toHaveBeenCalled();
});
it("rejects another participant and malformed controls without touching the session", async () => {
  const { session, handle } = setup();
  await expect(handle("stranger", '{"action":"start"}')).rejects.toThrow();
  await expect(handle("owner", "invalid")).rejects.toThrow();
  expect(session.input.setAudioEnabled).not.toHaveBeenCalled();
});
