import { useEffect, useMemo, useRef } from "react";
import { TerminalView, type TerminalViewRef } from "expo-libghostty";
import { useThemeColor } from "@/hooks/use-theme";
import type { ProjectTerminalSession } from "../actions/terminal-session";
import { terminalCardBackground } from "../lib/colors";

export const TerminalSurface = ({
  session,
  fontSize,
}: {
  session: ProjectTerminalSession;
  fontSize: number;
}) => {
  const terminal = useRef<TerminalViewRef>(null);
  const lastSize = useRef("");
  // The parent scopes editor palette variables around this native view.
  const panelBackground = useThemeColor("background") as string;
  const card = useThemeColor("card") as string;
  const background = terminalCardBackground(card, panelBackground);
  const foreground = useThemeColor("foreground") as string;
  const primary = useThemeColor("primary") as string;
  const secondary = useThemeColor("secondary") as string;
  const muted = useThemeColor("muted-foreground") as string;
  const tag = useThemeColor("syntax-tag") as string;
  const string = useThemeColor("syntax-string") as string;
  const number = useThemeColor("syntax-number") as string;
  const functionColor = useThemeColor("syntax-function") as string;
  const keyword = useThemeColor("syntax-keyword") as string;
  const property = useThemeColor("syntax-property") as string;
  const theme = useMemo(
    () => ({
      background,
      foreground,
      cursorColor: primary,
      selectionBackground: secondary,
      selectionForeground: foreground,
      palette: [
        muted,
        tag,
        string,
        number,
        functionColor,
        keyword,
        property,
        foreground,
        muted,
        tag,
        string,
        number,
        functionColor,
        keyword,
        property,
        foreground,
      ],
    }),
    [
      background,
      foreground,
      primary,
      secondary,
      muted,
      tag,
      string,
      number,
      functionColor,
      keyword,
      property,
    ],
  );

  useEffect(() => {
    const view = terminal.current;
    if (!view) return;
    let writes = Promise.resolve();
    const write = (chunk: string) => {
      if (!chunk) return;
      writes = writes.then(() => view.writeText(chunk)).catch(() => {});
    };
    write(session.getRawOutput());
    return session.subscribeRawOutput(write);
  }, [session]);

  return (
    <TerminalView
      ref={terminal}
      style={{ flex: 1 }}
      fontSize={fontSize}
      theme={theme}
      onInput={({ nativeEvent }) => {
        if (nativeEvent.text)
          void session.sendInput(nativeEvent.text).catch(() => {});
      }}
      onResize={({ nativeEvent }) => {
        const cols = Math.max(20, Math.min(240, nativeEvent.cols));
        const rows = Math.max(5, Math.min(100, nativeEvent.rows));
        const size = `${cols}:${rows}`;
        if (size === lastSize.current) return;
        lastSize.current = size;
        void session.resize(cols, rows).catch(() => {});
      }}
    />
  );
};
