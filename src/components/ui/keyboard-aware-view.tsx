import { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type KeyboardMetrics,
  type ViewProps,
} from "react-native";

/** A full-height viewport whose bottom edge meets the bottom of the window. */
export const KeyboardAwareView = ({ style, ...props }: ViewProps) => {
  const [keyboardInset, setKeyboardInset] = useState(0);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (process.env.EXPO_OS !== "ios") return;
    const updateInset = (frame: KeyboardMetrics | undefined) => {
      // Fabric measurements inside native-stack modals omit the modal's UIKit
      // origin. This bottom-aligned viewport needs only the keyboard's overlap
      // with the window, so neither a view measurement nor a header offset is used.
      setKeyboardInset(
        frame ? Math.min(frame.height, Math.max(0, height - frame.screenY)) : 0,
      );
    };
    const update = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      updateInset(event.endCoordinates);
    };
    const hide = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      updateInset(undefined);
    };
    const subscriptions = [
      Keyboard.addListener("keyboardWillShow", update),
      Keyboard.addListener("keyboardWillChangeFrame", update),
      Keyboard.addListener("keyboardDidChangeFrame", update),
      Keyboard.addListener("keyboardWillHide", hide),
      Keyboard.addListener("keyboardDidHide", hide),
    ];
    updateInset(Keyboard.metrics());
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [height, width]);

  if (process.env.EXPO_OS !== "ios") {
    return <KeyboardAvoidingView {...props} style={style} behavior="height" />;
  }

  const paddingBottom = StyleSheet.flatten(style)?.paddingBottom;
  return (
    <View
      {...props}
      style={[
        style,
        keyboardInset > 0
          ? {
              paddingBottom:
                keyboardInset +
                (typeof paddingBottom === "number" ? paddingBottom : 0),
            }
          : undefined,
      ]}
    />
  );
};
