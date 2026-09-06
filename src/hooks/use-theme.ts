import { useColorScheme } from "react-native";

export const useTheme = () => {
  const colorScheme = useColorScheme();

  return { isDarkMode: colorScheme === "dark" };
};
