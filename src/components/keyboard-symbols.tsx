import { Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CodeText } from "@/components/ui/text";

export const keyboardSymbols = [
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  "<",
  ">",
  ".",
  ",",
  ":",
  ";",
  "'",
  '"',
  "=",
  "#",
  "@",
  "_",
  "/",
  "\\",
  "|",
  "+",
  "-",
  "!",
  "?",
  "%",
  "&",
  "*",
  "^",
  "$",
  "~",
  "`",
] as const;
const formatSymbolLabel = (symbol: string) => {
  switch (symbol) {
    case "'":
      return "Apostrophe";
    case '"':
      return "Double quote";
    default:
      return `Insert ${symbol}`;
  }
};

export const KeyboardSymbols = ({
  onInsert,
  onTab,
  testID,
}: {
  onInsert: (symbol: string) => void;
  onTab?: () => void;
  testID?: string;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      horizontal
      accessibilityLabel="Special characters"
      accessibilityHint="Swipe horizontally for more symbols"
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={{ height: 48, flexGrow: 0 }}
      contentContainerStyle={{
        alignItems: "center",
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {onTab ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Insert tab"
          accessibilityHint="Uses your editor indentation settings"
          onPress={onTab}
          className="h-12 w-14 items-center justify-center active:opacity-50"
        >
          <CodeText className="text-base text-foreground">Tab</CodeText>
        </Pressable>
      ) : null}
      {keyboardSymbols.map((symbol) => (
        <Pressable
          key={symbol}
          accessibilityRole="button"
          accessibilityLabel={formatSymbolLabel(symbol)}
          onPress={() => onInsert(symbol)}
          className="h-12 w-11 items-center justify-center active:opacity-50"
        >
          <CodeText className="text-xl text-foreground">{symbol}</CodeText>
        </Pressable>
      ))}
    </ScrollView>
  );
};
