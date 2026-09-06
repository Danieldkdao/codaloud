import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme";
import { MAIN_TAB_BAR_HEIGHT } from "@/lib/constants";

export const CreateProjectButton = ({ onPress }: { onPress: () => void }) => {
  const shadow = useThemeColor("navigation-shadow");

  return (
    <Button
      onPress={onPress}
      accessibilityLabel="Create a new project"
      size="icon-lg"
      className="shrink-0 rounded-full bg-primary"
      style={{
        width: MAIN_TAB_BAR_HEIGHT,
        height: MAIN_TAB_BAR_HEIGHT,
        boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 18, color: shadow }],
      }}
    >
      <Icon
        family="Feather"
        name="plus"
        size={32}
        className="text-primary-foreground"
        accessible={false}
      />
    </Button>
  );
};
