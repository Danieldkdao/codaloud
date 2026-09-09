import { TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconProps } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type WorkspaceTabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: IconProps;
};

const WorkspaceTabButton = ({
  isFocused,
  label,
  icon,
  style,
  ...props
}: WorkspaceTabButtonProps) => (
  <Pressable
    {...props}
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: isFocused }}
    // TabTrigger passes inline space-between alignment, which overrides classes.
    style={(state) => [
      typeof style === "function" ? style(state) : style,
      { flexDirection: "row", alignItems: "center", justifyContent: "center" },
    ]}
    className={cn(
      "min-h-14 min-w-0 flex-1 items-center justify-center border-b-2 border-transparent px-1 py-3 active:bg-secondary focus-visible:outline-2 focus-visible:outline-ring",
      isFocused && "border-secondary-foreground bg-secondary/50",
    )}
  >
    <View className="flex-row flex-wrap items-center justify-center gap-2">
      <Icon
        {...icon}
        size={18}
        accessible={false}
        className={
          isFocused ? "text-secondary-foreground" : "text-muted-foreground"
        }
      />
      <PText
        accessible={false}
        className={
          isFocused
            ? "font-medium text-secondary-foreground"
            : "text-muted-foreground"
        }
      >
        {label}
      </PText>
    </View>
  </Pressable>
);

export const ProjectWorkspaceDock = () => {
  const insets = useSafeAreaInsets();
  const controlsPadding = Math.max(insets.bottom - 12, 8);

  return (
    <View
      className="border-t border-border bg-card"
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: controlsPadding,
      }}
    >
      <View className="w-full max-w-3xl self-center">
        <View className="flex-row border-b border-border">
          <TabTrigger name="files" asChild>
            <WorkspaceTabButton
              label="Files"
              icon={{ family: "Feather", name: "folder" }}
            />
          </TabTrigger>
          <TabTrigger name="code" asChild>
            <WorkspaceTabButton
              label="Code"
              icon={{ family: "Ionicons", name: "document-text-outline" }}
            />
          </TabTrigger>
          <TabTrigger name="git" asChild>
            <WorkspaceTabButton
              label="Git"
              icon={{ family: "Feather", name: "git-branch" }}
            />
          </TabTrigger>
          <TabTrigger name="agent" asChild>
            <WorkspaceTabButton
              label="Agent"
              icon={{ family: "Ionicons", name: "sparkles-outline" }}
            />
          </TabTrigger>
        </View>
        <View
          className="flex-row items-center px-2"
          style={{ paddingTop: 12 }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous file"
              className="size-12 items-center justify-center rounded-full"
            >
              <Icon
                family="Feather"
                name="arrow-left"
                size={20}
                accessible={false}
                className="text-foreground"
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next file"
              className="size-12 items-center justify-center rounded-full"
            >
              <Icon
                family="Feather"
                name="arrow-right"
                size={20}
                accessible={false}
                className="text-foreground"
              />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Microphone"
            className="size-16 items-center justify-center rounded-full bg-secondary"
          >
            <Icon
              family="Feather"
              name="mic"
              size={24}
              accessible={false}
              className="text-secondary-foreground"
            />
          </Pressable>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo"
              className="size-12 items-center justify-center rounded-full"
            >
              <Icon
                family="Feather"
                name="corner-up-left"
                size={20}
                accessible={false}
                className="text-foreground"
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Redo"
              className="size-12 items-center justify-center rounded-full"
            >
              <Icon
                family="Feather"
                name="corner-up-right"
                size={20}
                accessible={false}
                className="text-foreground"
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};
