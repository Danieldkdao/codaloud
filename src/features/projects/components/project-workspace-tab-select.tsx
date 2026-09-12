import { Feather, Ionicons } from "@expo/vector-icons";
import { useTabTrigger } from "expo-router/ui";
import { useEffect, useState } from "react";
import { PixelRatio, Platform, View, type ImageSourcePropType } from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { formatWorkspaceTab } from "@/features/projects/lib/formatters";
import type { ProjectWorkspaceTab } from "@/features/projects/types";
import { useThemeColor } from "@/hooks/use-theme";

const workspaceTabs = ["files", "code", "git", "agent"] as const;

export const ProjectWorkspaceTabSelect = ({ tab }: { tab: ProjectWorkspaceTab }) => {
  const { switchTab } = useTabTrigger({ name: tab });
  const currentTab = formatWorkspaceTab(tab);
  const foreground = useThemeColor("native-menu-foreground");
  const [menuImages, setMenuImages] = useState<Partial<Record<ProjectWorkspaceTab, ImageSourcePropType>>>({});

  useEffect(() => {
    let active = true;
    // Render the same glyphs as the trigger for both native menu implementations.
    // SwiftUI's menu reads UIImage pixels as points and ignores the label frame.
    const imageSize = Platform.OS === "ios" ? 20 / PixelRatio.get() : 20;
    Promise.all(workspaceTabs.map(async (name) => {
      const { icon } = formatWorkspaceTab(name);
      const image = icon.family === "Feather"
        ? await Feather.getImageSource(icon.name, imageSize, foreground)
        : await Ionicons.getImageSource(icon.name, imageSize, foreground);
      return [name, image ?? undefined] as const;
    })).then((images) => {
      if (active) setMenuImages(Object.fromEntries(images));
    }).catch(() => {});
    return () => { active = false; };
  }, [foreground]);

  return (
    <GlassSurface borderRadius={36}>
      <NativeSelect
        label="Workspace"
        trigger={
          <View className="size-18 items-center justify-center rounded-full">
            <Icon {...currentTab.icon} size={26} accessible={false} className="text-foreground" />
          </View>
        }
        sections={[{
          label: "",
          value: tab,
          options: workspaceTabs.map((name) => {
            const presentation = formatWorkspaceTab(name);
            return {
              value: name,
              label: presentation.label,
              image: menuImages[name],
              onSelect: () => switchTab(name, { resetOnFocus: false }),
            };
          }),
        }]}
      />
    </GlassSurface>
  );
};
