import { createContext, use, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";

type SearchLayer = {
  id: string;
  children: ReactNode;
  onOutsidePress: () => void;
  onShow: () => void;
};

type SearchOverlayHost = {
  present: (layer: SearchLayer) => void;
  remove: (id: string) => void;
  measureRoot: (callback: (x: number, y: number, windowY: number) => void) => void;
};

const SearchOverlayContext = createContext<SearchOverlayHost | null>(null);

export const ProjectSearchOverlayProvider = ({ children, bottomAligned = false }: { children: ReactNode; bottomAligned?: boolean }) => {
  const { height: windowHeight } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const activeLayer = useRef<SearchLayer | null>(null);
  const outsideTouch = useRef<object | null>(null);
  const [layer, setLayer] = useState<SearchLayer | null>(null);
  const host = useMemo<SearchOverlayHost>(() => ({
    present: (next) => {
      activeLayer.current = next;
      setLayer(next);
    },
    remove: (id) => {
      if (activeLayer.current?.id !== id) return;
      activeLayer.current = null;
      setLayer(null);
    },
    measureRoot: (callback) => rootRef.current?.measureInWindow((x, y, _width, height) => {
      // Fabric can report modal-local y coordinates. A full-height modal still
      // meets the window bottom, which gives its actual keyboard-space origin.
      callback(x, y, bottomAligned && Platform.OS === "ios" ? windowHeight - height : y);
    }),
  }), [bottomAligned, windowHeight]);

  return (
    <SearchOverlayContext value={host}>
      <View ref={rootRef} collapsable={false} testID="project-search-root" style={{ flex: 1 }}
        onStartShouldSetResponderCapture={() => {
          const current = activeLayer.current;
          if (current) {
            const touch = {};
            outsideTouch.current = touch;
            // Let capture reach the floating controls first. Neither this root nor
            // the overlay claims the responder, so the original control gets the tap.
            queueMicrotask(() => {
              if (outsideTouch.current === touch && activeLayer.current?.id === current.id) {
                activeLayer.current.onOutsidePress();
              }
            });
          }
          return false;
        }}>
        {children}
        {layer && (
          <View key={layer.id} testID="project-search-overlay" pointerEvents="box-none"
            style={StyleSheet.absoluteFill} onLayout={layer.onShow}
            onStartShouldSetResponderCapture={() => {
              outsideTouch.current = null;
              return false;
            }}>
            {layer.children}
          </View>
        )}
      </View>
    </SearchOverlayContext>
  );
};

export const useProjectSearchOverlay = () => {
  const host = use(SearchOverlayContext);
  if (!host) throw new Error("Search requires ProjectSearchOverlayProvider.");
  return host;
};

export const ProjectSearchOverlay = ({ children, onOutsidePress, onShow }: Omit<SearchLayer, "id">) => {
  const host = useProjectSearchOverlay();
  const id = useId();
  useLayoutEffect(() => {
    host.present({ id, children, onOutsidePress, onShow });
  }, [host, id, children, onOutsidePress, onShow]);
  useLayoutEffect(() => () => host.remove(id), [host, id]);
  return null;
};
