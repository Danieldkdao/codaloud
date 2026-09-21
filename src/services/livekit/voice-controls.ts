import type { voice } from "@livekit/agents";
import { voiceControlSchema } from "@/features/voice/schemas";

type ControlledSession = Pick<
  voice.AgentSession,
  "interrupt" | "clearUserTurn" | "commitUserTurn" | "updateOptions"
> & {
  input: Pick<voice.AgentSession["input"], "setAudioEnabled">;
};

export const createVoiceControlHandler = (
  session: ControlledSession,
  participantIdentity: string,
) => {
  let holding = false;
  return async (callerIdentity: string, payload: string) => {
    if (callerIdentity !== participantIdentity || payload.length > 256)
      throw new Error("Unauthorized voice control");
    const { action } = voiceControlSchema.parse(JSON.parse(payload));
    switch (action) {
      case "start":
        if (holding) break;
        session.interrupt({ force: true });
        session.clearUserTurn();
        session.updateOptions({ turnHandling: { turnDetection: "manual" } });
        holding = true;
        session.input.setAudioEnabled(true);
        break;
      case "commit":
        if (!holding) break;
        holding = false;
        session.input.setAudioEnabled(false);
        session.commitUserTurn();
        break;
      case "hands-free":
        holding = false;
        session.clearUserTurn();
        session.updateOptions({ turnHandling: { turnDetection: "stt" } });
        session.input.setAudioEnabled(true);
        break;
      case "cancel":
      case "stop":
        holding = false;
        session.input.setAudioEnabled(false);
        session.interrupt({ force: true });
        session.clearUserTurn();
        break;
    }
    return "ok";
  };
};
