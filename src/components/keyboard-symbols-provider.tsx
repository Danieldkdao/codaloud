import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ContextType,
  type ReactNode,
} from "react";
import { Keyboard, Platform, View, useWindowDimensions } from "react-native";
import { KeyboardExtender } from "react-native-keyboard-controller";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import {
  KeyboardSymbolsContext,
  KeyboardSymbolsInsetContext,
  KeyboardSymbolsAccessoryHeightContext,
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
  // KeyboardExtender 1.21.9 draws its iOS 26 capsule 20pt inside the window.
  // Inset the scroll viewport too, so its first/last keys remain fully reachable.
  const glassInset = Platform.OS === "ios" && isLiquidGlassAvailable() ? 20 : 0;
  const measure = useCallback(() => {
    if (!frame) return;
    viewport.current?.measureInWindow((_x, y, _width, measuredHeight) => {
      if (frame === currentFrame.current)
        setBottom(Math.max(0, y + measuredHeight - frame.screenY));
    });
  }, [frame]);
  useEffect(measure, [measure, width, height, target]);
  const symbols = (
    <KeyboardSymbols
      onInsert={(symbol) => target?.insert(symbol)}
      onTab={() => target?.insert("\t")}
      onDismiss={() => Keyboard.dismiss()}
    />
  );
  return (
    <KeyboardSymbolsContext value={host}>
      <KeyboardSymbolsAccessoryHeightContext value={target ? 48 : 0}>
        <KeyboardSymbolsInsetContext
          value={Platform.OS === "android" && target ? 48 : 0}
        >
          {Platform.OS === "ios" ? (
            <>
              {children}
              {/* UIKit moves the content into the keyboard, but its Yoga node keeps
                its height even while disabled. Do not shrink the navigator for it. */}
              <View
                pointerEvents="box-none"
                // Keep measurable space for the native accessory's content. Absolute
                // positioning (not a zero-height constraint) prevents the screen gap.
                style={{ position: "absolute", left: 0, right: 0, height: 48 }}
              >
                {/* Listen before UIKit focuses an input, including in another window.
                  JS focus only routes insertion; toggling attachment here races iOS. */}
                <KeyboardExtender enabled>
                  <View
                    testID="keyboard-symbols-viewport"
                    style={{
                      marginLeft: glassInset,
                      marginRight: glassInset,
                      borderRadius: glassInset ? 24 : 0,
                      overflow: "hidden",
                    }}
                  >
                    {/* Rendered only while an opted-in field holds focus. The native
                      attachment stays on so the strip appears without a delay, but
                      an empty viewport collapses the accessory to nothing, which is
                      what keeps it off every other screen in the app. */}
                    {target ? symbols : null}
                  </View>
                </KeyboardExtender>
              </View>
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
      </KeyboardSymbolsAccessoryHeightContext>
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
