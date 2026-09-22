import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AppState,
  NativeModules,
  type GestureResponderEvent,
} from "react-native";
import { createVoiceController } from "../voice-controller";

export const useVoiceConversation = (
  enabled: boolean,
  scopeKey: string,
  projectId?: string,
) => {
  const project = useRef(projectId);
  project.current = projectId;
  const [controller] = useState(() =>
    createVoiceController(async (mode, signal, events) => {
      // The SDK constructs native event emitters during import. Check the same
      // native module names it uses before evaluating it in an older app binary.
      if (
        !NativeModules.WebRTCModule ||
        !NativeModules.LivekitReactNativeModule
      ) {
        throw new Error(
          "Voice is missing from this app build. Rebuild and reinstall the app to enable it.",
        );
      }
      // Expo discovers native routes when exporting API manifests. Load WebRTC
      // only on microphone activation, after the app is running on the device.
      const { connectNativeVoice } =
        await import("@/services/livekit/voice-native");
      return connectNativeVoice(
        mode,
        signal,
        events,
        project.current ? { projectId: project.current } : undefined,
      );
    }),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const held = useRef(false);
  const suppressTap = useRef(false);
  const previousTap = useRef(0);
  const stop = () => {
    held.current = false;
    setPressed(false);
    previousTap.current = 0;
    setOpen(false);
    void controller.stop();
  };
  const pause = () => {
    held.current = false;
    setPressed(false);
    previousTap.current = 0;
    setOpen(true);
    void controller.pause();
  };
  useEffect(() => {
    if (!enabled) {
      setPressed(false);
      void controller.stop();
    }
    return () => {
      void controller.stop();
    };
  }, [controller, enabled, scopeKey]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      // iOS becomes inactive while presenting the microphone permission prompt.
      if (next === "background") {
        setPressed(false);
        void controller.stop();
      }
    });
    return () => subscription.remove();
  }, [controller]);

  const endTouch = () => {
    setPressed(false);
    if (held.current) {
      held.current = false;
      void controller.release();
    }
  };

  return {
    state,
    pressed,
    visible: enabled && (open || state.connection !== "idle"),
    stop,
    pause,
    startHandsFree: () => {
      if (enabled) {
        setOpen(true);
        void controller.start("hands-free");
      }
    },
    onTouchStart: () => {
      setPressed(true);
      // Pressability may reactivate while the same finger is still down.
      if (held.current) return;
      suppressTap.current = false;
    },
    onLongPress: () => {
      if (!enabled || controller.getSnapshot().mode === "hands-free") return;
      held.current = true;
      suppressTap.current = true;
      previousTap.current = 0;
      setOpen(true);
      void controller.start("hold");
    },
    onTouchEnd: endTouch,
    onPressOut: (event: GestureResponderEvent) => {
      // Responder release survives child/layout changes that can lose a raw
      // touch-end. Leaving the press rectangle with a finger down is not release.
      if (event.nativeEvent.touches.length === 0) endTouch();
    },
    onTouchCancel: () => {
      setPressed(false);
      held.current = false;
      suppressTap.current = true;
      void controller.release(true);
    },
    onPress: () => {
      if (!enabled || suppressTap.current) return;
      if (controller.getSnapshot().mode === "hands-free") {
        pause();
        return;
      }
      const now = Date.now();
      if (previousTap.current && now - previousTap.current <= 300) {
        previousTap.current = 0;
        setOpen(true);
        void controller.start("hands-free");
      } else {
        previousTap.current = now;
        setOpen(true);
      }
    },
  };
};

export type VoiceConversation = ReturnType<typeof useVoiceConversation>;
