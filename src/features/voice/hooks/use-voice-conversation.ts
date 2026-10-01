import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AppState,
  NativeModules,
  type GestureResponderEvent,
} from "react-native";
import { createVoiceController } from "../voice-controller";
import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";
import { inlineSession } from "../inline-session";

export const useVoiceConversation = (
  enabled: boolean,
  scopeKey: string,
  projectId?: string,
  draftOnly = false,
  dynamicScope = false,
) => {
  const { preferences } = useEditorPreferences();
  const voiceEnabled = enabled && !preferences.textMode;
  const project = useRef(projectId);
  const draft = useRef(draftOnly);
  const requestedMode = useRef<"quick-edit" | undefined>(undefined);
  project.current = projectId;
  draft.current = draftOnly;
  const [controller] = useState(() =>
    createVoiceController(
      async (mode, signal, events) => {
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
          project.current
            ? {
                projectId: project.current,
                ...(draft.current ? { draftOnly: true } : {}),
                ...(dynamicScope
                  ? { getProjectId: () => project.current ?? "app" }
                  : {}),
              }
            : undefined,
        );
      },
      async () => {
        if (project.current)
          await inlineSession.begin(
            project.current,
            draft.current ? "quick-edit" : requestedMode.current,
          );
      },
      () => {
        // A turn that already failed keeps its specific message on screen.
        // Cancelling it here would erase the actionable reason and leave only
        // the generic connection error the agent reports afterwards.
        const request = inlineSession.getSnapshot();
        if (
          request &&
          request.projectId === project.current &&
          request.status !== "error"
        )
          inlineSession.cancel();
      },
    ),
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
    if (inlineSession.getSnapshot()?.projectId === project.current)
      inlineSession.cancel();
    held.current = false;
    setPressed(false);
    previousTap.current = 0;
    setOpen(false);
    if (requestedMode.current === "quick-edit") void controller.park();
    else void controller.stop();
  };
  const pause = () => {
    held.current = false;
    setPressed(false);
    previousTap.current = 0;
    setOpen(true);
    void controller.pause();
  };
  useEffect(() => {
    if (!voiceEnabled) {
      setPressed(false);
      void controller.stop();
    }
    return () => {
      void controller.stop();
    };
  }, [controller, voiceEnabled, scopeKey]);
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
  useEffect(() => {
    let previous = inlineSession.getSnapshot();
    return inlineSession.subscribe(() => {
      const next = inlineSession.getSnapshot();
      if (
        next?.projectId === project.current &&
        (next?.status === "generating" ||
          (next?.mode === "quick-edit" && next.status === "answered")) &&
        previous?.status !== next?.status
      )
        controller.captureEnded();
      if (
        previous?.projectId === project.current &&
        previous &&
        ["listening", "generating", "ready"].includes(previous.status) &&
        (!next || next.status === "error")
      ) {
        // Cancel invalidates the local request synchronously; stop interrupts
        // the worker and resets capture so the next tap can start immediately.
        void controller.pause(true);
      }
      previous = next;
    });
  }, [controller]);
  const inline = useSyncExternalStore(
    inlineSession.subscribe,
    inlineSession.getSnapshot,
  );

  const endTouch = () => {
    setPressed(false);
    if (held.current) {
      held.current = false;
      void controller.release();
    }
  };

  return {
    projectId,
    showInline: () => {
      requestedMode.current = "quick-edit";
      setOpen(true);
    },
    state:
      inline &&
      inline.projectId === projectId &&
      ["generating", "ready", "applying"].includes(inline.status)
        ? { ...state, listening: false }
        : state,
    pressed,
    visible:
      enabled && (open || state.listening || state.connection === "connecting"),
    stop,
    pause,
    startInline: () => {
      if (!voiceEnabled) return;
      requestedMode.current = "quick-edit";
      setOpen(true);
      void controller.start("hands-free");
    },
    startHandsFree: () => {
      if (voiceEnabled) {
        requestedMode.current = draft.current ? "quick-edit" : undefined;
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
      if (!voiceEnabled || controller.getSnapshot().mode === "hands-free")
        return;
      held.current = true;
      suppressTap.current = true;
      previousTap.current = 0;
      requestedMode.current = draft.current ? "quick-edit" : undefined;
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
      if (!voiceEnabled || suppressTap.current) return;
      if (controller.getSnapshot().mode === "hands-free") {
        pause();
        return;
      }
      const now = Date.now();
      if (previousTap.current && now - previousTap.current <= 300) {
        requestedMode.current = draft.current ? "quick-edit" : undefined;
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
