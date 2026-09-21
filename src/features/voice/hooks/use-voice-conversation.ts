import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { connectNativeVoice } from "@/services/livekit/voice-native";
import { createVoiceController } from "../voice-controller";

export const useVoiceConversation = (enabled: boolean, scopeKey: string) => {
  const [controller] = useState(() =>
    createVoiceController(connectNativeVoice),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [hint, setHint] = useState(false);
  const held = useRef(false);
  const suppressTap = useRef(false);
  const previousTap = useRef(0);
  const stop = () => {
    held.current = false;
    previousTap.current = 0;
    setHint(false);
    void controller.stop();
  };
  useEffect(() => {
    if (!enabled) {
      void controller.stop();
      setHint(false);
    }
    return () => {
      void controller.stop();
    };
  }, [controller, enabled, scopeKey]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      // iOS becomes inactive while presenting the microphone permission prompt.
      if (next === "background") {
        void controller.stop();
        setHint(false);
      }
    });
    return () => subscription.remove();
  }, [controller]);

  return {
    state,
    visible: enabled && (hint || state.connection !== "idle"),
    stop,
    startHandsFree: () => {
      if (enabled) {
        setHint(false);
        void controller.start("hands-free");
      }
    },
    onPressIn: () => {
      held.current = false;
      suppressTap.current = false;
    },
    onLongPress: () => {
      if (!enabled || controller.getSnapshot().mode === "hands-free") return;
      held.current = true;
      suppressTap.current = true;
      previousTap.current = 0;
      setHint(false);
      void controller.start("hold");
    },
    onPressOut: () => {
      if (held.current) {
        held.current = false;
        void controller.release();
      }
    },
    onTouchCancel: () => {
      held.current = false;
      suppressTap.current = true;
      void controller.release(true);
    },
    onPress: () => {
      if (!enabled || suppressTap.current) return;
      if (controller.getSnapshot().mode === "hands-free") {
        stop();
        return;
      }
      const now = Date.now();
      if (previousTap.current && now - previousTap.current <= 300) {
        previousTap.current = 0;
        setHint(false);
        void controller.start("hands-free");
      } else {
        previousTap.current = now;
        setHint(true);
      }
    },
  };
};

export type VoiceConversation = ReturnType<typeof useVoiceConversation>;
