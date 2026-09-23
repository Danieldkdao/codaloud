import { Keyboard, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { formatWorkspaceSearch } from "@/features/projects/lib/formatters";
import { cn } from "@/lib/utils";

type ProjectAgentSearchProps = {
  query: string;
  onQueryChange: (query: string) => void;
  floating?: boolean;
};

export const ProjectAgentSearch = ({
  query,
  onQueryChange,
  floating = false,
}: ProjectAgentSearchProps) => {
  const insets = useSafeAreaInsets();
  const presentation = formatWorkspaceSearch("agent");

  return (
    <View
      testID="agent-activity-search"
      pointerEvents="box-none"
      className={cn(!floating && "bg-background")}
      style={{
        position: floating ? "absolute" : undefined,
        bottom: floating ? 0 : undefined,
        left: floating ? 0 : undefined,
        right: floating ? 0 : undefined,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
      }}
    >
      <GlassSurface>
        <View className="min-h-14 flex-row items-center pl-4 pr-1">
          <Icon
            family="Feather"
            name="search"
            size={20}
            className="text-muted-foreground"
            accessible={false}
          />
          <Input
            type="search"
            variant="ghost"
            value={query}
            onChangeText={onQueryChange}
            placeholder={presentation.placeholder}
            accessibilityLabel={presentation.accessibilityLabel}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            containerClassName="min-w-0 flex-1"
            className="h-14 border-0 bg-transparent px-2 focus:border-transparent focus:outline-0"
          />
          {query.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear activity search"
              onPress={() => onQueryChange("")}
              className="size-11 items-center justify-center rounded-full active:bg-secondary"
            >
              <Icon
                family="Feather"
                name="x"
                size={20}
                className="text-muted-foreground"
                accessible={false}
              />
            </Pressable>
          )}
        </View>
      </GlassSurface>
    </View>
  );
};
