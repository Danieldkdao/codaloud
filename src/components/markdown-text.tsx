import { useThemeColor } from "@/hooks/use-theme";
import { memo, useMemo } from "react";
import { Alert, Linking } from "react-native";
import {
  EnrichedMarkdownText,
  type MarkdownStyle,
} from "react-native-enriched-markdown";
import remend from "remend";

type MarkdownTextProps = { text: string; streaming?: boolean };

export const MarkdownText = memo(
  ({ text, streaming = false }: MarkdownTextProps) => {
    const foreground = useThemeColor("foreground") as string;
    const muted = useThemeColor("muted-foreground") as string;
    const primary = useThemeColor("primary") as string;
    const primaryForeground = useThemeColor("primary-foreground") as string;
    const background = useThemeColor("background") as string;
    const card = useThemeColor("card") as string;
    const border = useThemeColor("border") as string;
    const markdown = useMemo(
      () => (streaming ? remend(text, { linkMode: "text-only" }) : text),
      [text, streaming],
    );
    const markdownStyle = useMemo<MarkdownStyle>(() => {
      const body = {
        fontSize: 16,
        fontFamily: "Outfit_400Regular",
        color: foreground,
        marginTop: 0,
        marginBottom: 8,
      };
      const heading = { ...body, fontWeight: "600", marginTop: 12 };
      return {
        paragraph: body,
        h1: { ...heading, fontSize: 24 },
        h2: { ...heading, fontSize: 22 },
        h3: { ...heading, fontSize: 20 },
        h4: { ...heading, fontSize: 18 },
        h5: heading,
        h6: heading,
        strong: { color: foreground },
        em: { color: foreground },
        strikethrough: { color: muted },
        underline: { color: foreground },
        link: { color: primary, underline: true },
        list: {
          ...body,
          bulletColor: primary,
          markerColor: muted,
          marginLeft: 16,
          gapWidth: 8,
          itemSpacing: 4,
        },
        blockquote: {
          ...body,
          borderColor: primary,
          backgroundColor: card,
          borderWidth: 3,
          padding: 10,
          borderRadius: 8,
        },
        code: {
          fontFamily: "JetBrainsMono_400Regular",
          fontSize: 16,
          color: foreground,
          backgroundColor: "#RRGGBB",
        },
        codeBlock: {
          ...body,
          fontFamily: "JetBrainsMono_400Regular",
          backgroundColor: card,
          borderColor: border,
          borderRadius: 10,
          padding: 12,
          syntaxColors: {
            keyword: primary,
            operator: foreground,
            punctuation: muted,
            string: primary,
            number: primary,
            constant: primary,
            comment: muted,
            function: foreground,
            type: primary,
            variable: foreground,
            property: foreground,
            tag: primary,
            attribute: foreground,
            embedded: foreground,
          },
        },
        table: {
          ...body,
          headerTextColor: foreground,
          headerBackgroundColor: card,
          rowEvenBackgroundColor: background,
          rowOddBackgroundColor: card,
          borderColor: border,
          borderRadius: 8,
          cellPaddingHorizontal: 10,
          cellPaddingVertical: 8,
        },
        taskList: {
          checkedColor: primary,
          borderColor: border,
          checkmarkColor: primaryForeground,
          checkedTextColor: muted,
        },
        thematicBreak: {
          color: border,
          height: 1,
          marginTop: 8,
          marginBottom: 8,
        },
        math: {
          fontSize: 16,
          color: foreground,
          backgroundColor: card,
          padding: 8,
        },
        inlineMath: { color: foreground },
        image: { maxHeight: 200, resizeMode: "contain", borderRadius: 8 },
        spoiler: { color: muted },
        highlight: { color: foreground, backgroundColor: card },
      };
    }, [
      foreground,
      muted,
      primary,
      primaryForeground,
      background,
      card,
      border,
    ]);
    return (
      <EnrichedMarkdownText
        markdown={markdown}
        markdownStyle={markdownStyle}
        containerStyle={{ width: "100%", flexShrink: 1 }}
        flavor="github"
        selectable
        allowFontScaling
        enableLinkPreview={false}
        enableTaskListItemToggle={false}
        onLinkPress={async ({ url }) => {
          // Model output must not launch arbitrary app intents or local files.
          try {
            const target = new URL(url);
            if (target.protocol !== "https:" && target.protocol !== "http:")
              return;
            await Linking.openURL(url);
          } catch {
            Alert.alert(
              "Couldn’t open link",
              "Try opening the address in your browser.",
            );
          }
        }}
      />
    );
  },
);
