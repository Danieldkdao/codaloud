import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import type { View } from "react-native";

type Anchor = { scope: string; top: number };
export const CommandBubbleVisibleContext = createContext(false);
const anchors = new Map<string, Anchor>();
const listeners = new Set<() => void>();
let snapshot: Anchor[] = [];
const publish = () => {
  snapshot = [...anchors.values()];
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Report screen coordinates so overlays work across nested routes and resized keyboards. */
export const useCommandBubbleAnchor = (scope?: string, enabled = true) => {
  const id = useId();
  const ref = useRef<View>(null);
  const version = useRef(0);
  const current = useRef({ scope, enabled });
  current.current = { scope, enabled };
  const measure = useCallback(() => {
    const host = ref.current;
    if (!scope || !enabled || !host) return;
    const request = ++version.current;
    host.measureInWindow((_x, top, _width, height) => {
      if (
        request !== version.current ||
        ref.current !== host ||
        current.current.scope !== scope ||
        !current.current.enabled ||
        height <= 0
      )
        return;
      const previous = anchors.get(id);
      if (previous?.scope === scope && Math.abs(previous.top - top) < 1) return;
      anchors.set(id, { scope, top });
      publish();
    });
  }, [id, scope, enabled]);
  useEffect(
    () => () => {
      version.current++;
      if (anchors.delete(id)) publish();
    },
    [id, scope, enabled],
  );
  // Layout changes include keyboard animation and controls expanding in place.
  useEffect(measure);
  return { ref, onLayout: measure, collapsable: false as const };
};

export const useCommandBubbleControlsTop = (scope: string) => {
  const values = useSyncExternalStore(subscribe, () => snapshot);
  const matching = values.filter(
    (anchor) => scope === anchor.scope || scope.startsWith(`${anchor.scope}/`),
  );
  return matching.length
    ? Math.min(...matching.map((anchor) => anchor.top))
    : undefined;
};
