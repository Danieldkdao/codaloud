import { GlassSurface } from "@/components/ui/glass-surface";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { Pressable, ScrollView, View } from "react-native";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type {
  EditorSearchCommand,
  EditorSearchQuery,
  EditorSearchSummary,
} from "../types";
import { formatEditorSearchSummary } from "../lib/formatters";

export const EditorSearchBar = ({
  query,
  summary,
  replace,
  onReplaceChange,
  onChange,
  onCommand,
  onClose,
}: {
  query: EditorSearchQuery;
  summary?: EditorSearchSummary;
  replace: boolean;
  onReplaceChange: (value: boolean) => void;
  onChange: (query: EditorSearchQuery) => void;
  onCommand: (command: EditorSearchCommand) => void;
  onClose: () => void;
}) => {
  const disabled = !summary?.total || Boolean(summary.error);
  return (
    <Animated.View
      layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
      className="gap-2"
    >
      {replace ? (
        <Animated.View
          entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
        >
          <GlassSurface>
            <View className="flex-row items-center gap-1 px-2">
              <Input
                variant="ghost"
                containerClassName="min-w-0 flex-1"
                className="text-base"
                accessibilityLabel="Replace with"
                placeholder="Replace with"
                value={query.replace ?? ""}
                onChangeText={(text) => onChange({ ...query, replace: text })}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Replace match"
                onPress={() => onCommand("replace")}
                className="min-h-11 min-w-11 items-center justify-center px-2 disabled:opacity-40"
              >
                <PText>One</PText>
              </Pressable>
              <Pressable
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Replace all matches"
                onPress={() => onCommand("replace-all")}
                className="min-h-11 min-w-11 items-center justify-center px-2 disabled:opacity-40"
              >
                <PText>All</PText>
              </Pressable>
            </View>
          </GlassSurface>
        </Animated.View>
      ) : null}
      <GlassSurface>
        <View className="flex-row items-center gap-1 px-2">
          <Input
            autoFocus
            variant="ghost"
            containerClassName="min-w-0 flex-1"
            className="text-base"
            accessibilityLabel="Find in file"
            placeholder="Find in file"
            value={query.search}
            onChangeText={(search) => onChange({ ...query, search })}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => onCommand("next")}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close file search"
            onPress={onClose}
            className="size-11 items-center justify-center"
          >
            <Icon
              family="Feather"
              name="x"
              size={22}
              className="text-foreground"
            />
          </Pressable>
        </View>
      </GlassSurface>
      <GlassSurface>
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center" }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Match case"
            accessibilityState={{ selected: Boolean(query.caseSensitive) }}
            onPress={() =>
              onChange({ ...query, caseSensitive: !query.caseSensitive })
            }
            className={cn(
              "min-h-11 min-w-11 items-center justify-center rounded-lg px-2",
              query.caseSensitive && "bg-secondary",
            )}
          >
            <PText>Aa</PText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Match whole words"
            accessibilityState={{ selected: Boolean(query.wholeWord) }}
            onPress={() => onChange({ ...query, wholeWord: !query.wholeWord })}
            className={cn(
              "min-h-11 min-w-11 items-center justify-center rounded-lg px-2",
              query.wholeWord && "bg-secondary",
            )}
          >
            <PText>Word</PText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use regular expression"
            accessibilityState={{ selected: Boolean(query.regexp) }}
            onPress={() => onChange({ ...query, regexp: !query.regexp })}
            className={cn(
              "min-h-11 min-w-11 items-center justify-center rounded-lg px-2",
              query.regexp && "bg-secondary",
            )}
          >
            <PText>.*</PText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle replace"
            accessibilityState={{ expanded: replace }}
            onPress={() => onReplaceChange(!replace)}
            className={cn(
              "size-11 items-center justify-center rounded-lg",
              replace && "bg-secondary",
            )}
          >
            <Icon
              family="MaterialCommunityIcons"
              name="find-replace"
              size={22}
              className="text-foreground"
            />
          </Pressable>
          <PText accessibilityLiveRegion="polite" className="px-2 text-base">
            {formatEditorSearchSummary(summary)}
          </PText>
          <Pressable
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Previous match"
            onPress={() => onCommand("previous")}
            className="size-11 items-center justify-center disabled:opacity-40"
          >
            <Icon
              family="Feather"
              name="chevron-up"
              size={22}
              className="text-foreground"
            />
          </Pressable>
          <Pressable
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Next match"
            onPress={() => onCommand("next")}
            className="size-11 items-center justify-center disabled:opacity-40"
          >
            <Icon
              family="Feather"
              name="chevron-down"
              size={22}
              className="text-foreground"
            />
          </Pressable>
        </ScrollView>
      </GlassSurface>
    </Animated.View>
  );
};
