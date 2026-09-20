import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ContextType,
  type ReactNode,
} from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { KeyboardExtender } from "react-native-keyboard-controller";
import {
  KeyboardSymbolsContext,
  KeyboardSymbolsInsetContext,
} from "@/hooks/use-keyboard-symbols";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { KeyboardSymbols } from "./keyboard-symbols";

type SymbolHost = NonNullable<ContextType<typeof KeyboardSymbolsContext>>;
type SymbolTarget = Parameters<SymbolHost["activate"]>[0];
type KeyboardSymbolsProviderProps = {
  children: ReactNode;
  local?: boolean;
  fill?: boolean;
};

const SymbolHostProvider = ({
  children,
  fill = false,
}: KeyboardSymbolsProviderProps) => {
  const [target, setTarget] = useState<SymbolTarget | null>(null);
  const host = useMemo<SymbolHost>(
    () => ({
      activate: setTarget,
      deactivate: (id) =>
        setTarget((current) => (current?.id === id ? null : current)),
    }),
    [],
  );
  const frame = useKeyboardFrame();
  const currentFrame = useRef(frame);
  currentFrame.current = frame;
  const viewport = useRef<View>(null);
  const [bottom, setBottom] = useState(0);
  const { width, height } = useWindowDimensions();
  const measure = useCallback(() => {
    if (!frame) return;
    viewport.current?.measureInWindow((_x, y, _width, measuredHeight) => {
      if (frame === currentFrame.current)
        setBottom(Math.max(0, y + measuredHeight - frame.screenY));
    });
  }, [frame]);
  useEffect(measure, [measure, width, height, target]);
  const symbols = (
    <KeyboardSymbols onInsert={(symbol) => target?.insert(symbol)} />
  );
  return (
    <KeyboardSymbolsContext value={host}>
      <KeyboardSymbolsInsetContext
        value={Platform.OS === "android" && target ? 48 : 0}
      >
        {Platform.OS === "ios" ? (
          <>
            {children}
            {/* Native attachment follows inputs into sheets and supports UITextView. */}
            <KeyboardExtender enabled={Boolean(target)}>
              {symbols}
            </KeyboardExtender>
          </>
        ) : (
          <View style={fill ? { flex: 1 } : undefined}>
            {children}
            {target && frame ? <View style={{ height: 48 }} /> : null}
            <View
              ref={viewport}
              collapsable={false}
              pointerEvents="box-none"
              onLayout={measure}
              style={{ position: "absolute", inset: 0, zIndex: 100 }}
            >
              {target && frame ? (
                <View
                  testID="keyboard-symbols-host"
                  className="bg-card border-t border-border"
                  style={{ position: "absolute", left: 0, right: 0, bottom }}
                >
                  {symbols}
                </View>
              ) : null}
            </View>
          </View>
        )}
      </KeyboardSymbolsInsetContext>
    </KeyboardSymbolsContext>
  );
};

/** Android overlays stay in the nearest native window; iOS uses one native accessory. */
export const KeyboardSymbolsProvider = ({
  local,
  ...props
}: KeyboardSymbolsProviderProps) =>
  local && Platform.OS === "ios" ? (
    props.children
  ) : (
    <SymbolHostProvider {...props} />
  );
