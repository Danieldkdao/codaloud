import { Icon, type IconProps } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PText } from "@/components/ui/text";
import { CreateProjectButton } from "@/features/projects/components/create-project-button";
import { cn } from "@/lib/utils";
import { MAIN_TAB_BAR_HEIGHT } from "@/lib/constants";
import { useRouter } from "expo-router";
import { TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: IconProps;
};

const TabButton = ({ isFocused, label, icon, ...props }: TabButtonProps) => (
  <Pressable
    {...props}
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: isFocused }}
    style={{
      height: MAIN_TAB_BAR_HEIGHT - 8,
      flexDirection: "column",
      justifyContent: "center",
    }}
    className={cn(
      "min-w-0 flex-1 items-center justify-center rounded-full active:bg-secondary",
      isFocused && "bg-secondary",
    )}
  >
    <Icon
      {...icon}
      size={24}
      accessible={false}
      className={isFocused ? "text-secondary-foreground" : "text-foreground"}
    />
    <PText
      accessible={false}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      className={isFocused ? "text-secondary-foreground" : "text-foreground"}
    >
      {label}
    </PText>
  </Pressable>
);

export const MainTabBar = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tabs = (
    <View
      className="flex-row items-center"
      style={{ height: MAIN_TAB_BAR_HEIGHT, padding: 4, gap: 4 }}
    >
      <TabTrigger name="projects" asChild>
        <TabButton
          label="Projects"
          icon={{ family: "Feather", name: "folder" }}
        />
      </TabTrigger>
      <TabTrigger name="drafts" asChild>
        <TabButton
          label="Drafts"
          icon={{ family: "Feather", name: "file-text" }}
        />
      </TabTrigger>
      <TabTrigger name="account" asChild>
        <TabButton
          label="Settings"
          icon={{ family: "Feather", name: "settings" }}
        />
      </TabTrigger>
    </View>
  );

  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: "box-none",
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <View
        className="w-full max-w-md flex-row items-center gap-3 self-center"
        style={{ pointerEvents: "box-none" }}
      >
        <View className="min-w-0 flex-1">
          <GlassSurface borderRadius={MAIN_TAB_BAR_HEIGHT / 2}>
            {tabs}
          </GlassSurface>
        </View>
        <CreateProjectButton onPress={() => router.push("/new-project")} />
      </View>
    </View>
  );
};
