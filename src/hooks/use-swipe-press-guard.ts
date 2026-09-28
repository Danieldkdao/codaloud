import { useRef } from "react";
import type { ViewProps } from "react-native";

// Match ReanimatedSwipeable's default drag activation offset so small drift
// doesn't fall into a gap where neither a tap nor a swipe is accepted.
const tapMovementLimit = 10;

type SwipePressGuardOptions = {
  allowPressDuringSettling?: boolean;
};

export const useSwipePressGuard = ({
  allowPressDuringSettling = false,
}: SwipePressGuardOptions = {}) => {
  const touchStart = useRef({ x: 0, y: 0 });
  const suppressed = useRef(false);
  const settling = useRef(false);

  const suppress = () => {
    suppressed.current = true;
  };
  const touchHandlers: Pick<
    ViewProps,
    "onTouchStart" | "onTouchMove" | "onTouchCancel"
  > = {
    onTouchStart: ({ nativeEvent }) => {
      touchStart.current = { x: nativeEvent.pageX, y: nativeEvent.pageY };
      // A fresh touch is independent of the previous swipe's animation. Native
      // ScrollView consumers still use a touch during momentum only to stop it.
      suppressed.current = settling.current && !allowPressDuringSettling;
    },
    onTouchMove: ({ nativeEvent }) => {
      if (
        Math.abs(nativeEvent.pageX - touchStart.current.x) > tapMovementLimit ||
        Math.abs(nativeEvent.pageY - touchStart.current.y) > tapMovementLimit
      )
        suppress();
    },
    onTouchCancel: suppress,
  };

  return {
    touchHandlers,
    shouldSuppressPress: () => suppressed.current,
    onDrag: suppress,
    onSettleStart: () => {
      settling.current = true;
      // Animation callbacks can arrive after a new touch. Drag/move/cancel
      // already suppress the swipe itself; don't cancel a new Swipeable tap.
      if (!allowPressDuringSettling) suppress();
    },
    onSettleEnd: () => {
      settling.current = false;
    },
  };
};
