import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme";
import { MAIN_TAB_BAR_HEIGHT } from "@/lib/constants";
import { View } from "react-native";

export const CreateProjectButton = ({ onPress }: { onPress?: () => void }) => {
  const shadow = useThemeColor("navigation-shadow");
  const style = {
    width: MAIN_TAB_BAR_HEIGHT,
    height: MAIN_TAB_BAR_HEIGHT,
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 18, color: shadow }],
  } as const;
  const icon = (
    <Icon
      family="Feather"
      name="plus"
      size={32}
      className="text-primary-foreground"
      accessible={false}
    />
  );

  if (!onPress)
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Create project or draft"
        className="shrink-0 items-center justify-center rounded-full bg-primary"
        style={style}
      >
        {icon}
      </View>
    );

  return (
    <Button
      onPress={onPress}
      accessibilityLabel="Create a new project"
      size="icon-lg"
      className="shrink-0 rounded-full bg-primary"
      style={style}
    >
      {icon}
    </Button>
  );
};
