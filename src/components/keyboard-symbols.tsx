import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CodeText } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { KeyboardKey } from "./keyboard-key";

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
  onDismiss,
  testID,
}: {
  onInsert: (symbol: string) => void;
  onTab?: () => void;
  onDismiss?: () => void;
  testID?: string;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View className="h-12 flex-row items-center" testID={testID}>
      <ScrollView
        horizontal
        accessibilityLabel="Special characters"
        accessibilityHint="Swipe horizontally for more symbols"
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        style={{ height: 48, flex: 1 }}
        contentContainerStyle={{
          alignItems: "center",
          paddingLeft: insets.left,
          paddingRight: 8,
        }}
      >
        {onTab ? (
          <KeyboardKey
            label="Insert tab"
            hint="Uses your editor indentation settings"
            onPress={onTab}
          >
            <CodeText className="text-base text-foreground">Tab</CodeText>
          </KeyboardKey>
        ) : null}
        {keyboardSymbols.map((symbol) => (
          <KeyboardKey
            key={symbol}
            label={formatSymbolLabel(symbol)}
            onPress={() => onInsert(symbol)}
          >
            <CodeText className="text-xl text-foreground">{symbol}</CodeText>
          </KeyboardKey>
        ))}
      </ScrollView>
      {onDismiss ? (
        <View
          className="border-l border-border"
          style={{ marginRight: insets.right }}
        >
          <KeyboardKey label="Hide keyboard" onPress={onDismiss}>
            <Icon
              family="MaterialCommunityIcons"
              name="keyboard-close-outline"
              size={22}
              className="text-foreground"
              accessible={false}
            />
          </KeyboardKey>
        </View>
      ) : null}
    </View>
  );
};
