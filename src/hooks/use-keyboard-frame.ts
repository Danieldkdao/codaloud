import { useEffect, useState } from "react";
import { Keyboard, type KeyboardEvent } from "react-native";

/** Includes frame changes from predictive text, rotation, and keyboard switching. */
export const useKeyboardFrame = () => {
  const [frame, setFrame] = useState(() => Keyboard.metrics());
  useEffect(() => {
    const update = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setFrame(
        event.endCoordinates.height > 0 ? event.endCoordinates : undefined,
      );
    };
    const hide = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setFrame(undefined);
    };
    const subscriptions = [
      Keyboard.addListener("keyboardWillShow", update),
      Keyboard.addListener("keyboardDidShow", update),
      Keyboard.addListener("keyboardWillChangeFrame", update),
      Keyboard.addListener("keyboardDidChangeFrame", update),
      Keyboard.addListener("keyboardWillHide", hide),
      Keyboard.addListener("keyboardDidHide", hide),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return frame;
};
