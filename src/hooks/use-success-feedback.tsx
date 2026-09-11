import { SuccessBanner } from "@/components/ui/success-banner";
import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo } from "react-native";

const SuccessFeedbackContext = createContext<((message: string) => void) | null>(null);
const displayDuration = 3200;
// Allow the 180ms exit animation to finish before removing the native overlay.
const exitDuration = 220;

export const SuccessFeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [feedback, setFeedback] = useState<{ id: number; message: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const showSuccess = useCallback((message: string) => {
    // A request can finish after signing out and unmounting this provider.
    if (!mounted.current) return;
    setFeedback({ id: ++sequence.current, message });
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const haptic = process.env.EXPO_OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Optional hardware feedback must never turn a successful action into an error.
    void haptic.catch(() => {});

    if (process.env.EXPO_OS === "ios") {
      AccessibilityInfo.announceForAccessibilityWithOptions(feedback.message, { queue: true });
    } else {
      AccessibilityInfo.announceForAccessibility(feedback.message);
    }

    const scheduleDismissal = async () => {
      let duration = displayDuration;
      try {
        if (await AccessibilityInfo.isScreenReaderEnabled()) duration = 6000;
        if (process.env.EXPO_OS === "android") {
          duration = Math.max(duration, await AccessibilityInfo.getRecommendedTimeoutMillis(duration));
        }
      } catch {
        // Fall back to the standard duration if accessibility settings are unavailable.
      }
      if (!cancelled) timeout = setTimeout(() => setVisible(false), duration);
    };
    void scheduleDismissal();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [feedback]);

  useEffect(() => {
    if (visible || !feedback) return;
    const timeout = setTimeout(() => setFeedback(null), exitDuration);
    return () => clearTimeout(timeout);
  }, [visible, feedback]);

  return (
    <SuccessFeedbackContext.Provider value={showSuccess}>
      {children}
      {feedback && (
        <SuccessBanner
          key={feedback.id}
          message={feedback.message}
          visible={visible}
          onDismiss={() => setVisible(false)}
        />
      )}
    </SuccessFeedbackContext.Provider>
  );
};

export const useSuccessFeedback = () => {
  const showSuccess = useContext(SuccessFeedbackContext);
  if (!showSuccess) throw new Error("useSuccessFeedback requires SuccessFeedbackProvider");
  return showSuccess;
};
