import { SvgXml } from "react-native-svg";
import { useTheme } from "@/hooks/use-theme";
import { getMaterialIconXml } from "@/lib/utils";

export type ProjectIconProps = {
  name: string;
  isDirectory: boolean;
  expanded?: boolean;
  size?: number;
};

export const ProjectIcon = ({
  name,
  isDirectory,
  expanded = false,
  size = 24,
}: ProjectIconProps) => {
  const { isDarkMode } = useTheme();

  // Preserve Material Icon Theme's original colors and its light-mode variants.
  return (
    <SvgXml
      xml={getMaterialIconXml({ name, isDirectory, expanded, light: !isDarkMode })}
      width={size}
      height={size}
      accessible={false}
    />
  );
};
