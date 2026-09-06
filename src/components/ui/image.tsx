import { useTheme } from "@/hooks/use-theme";
import { Image as ExpoImage } from "expo-image";
import type { ComponentPropsWithRef } from "react";

type ExpoImageProps = ComponentPropsWithRef<typeof ExpoImage>;

export type ImageProps = Omit<ExpoImageProps, "source"> & {
  source: {
    default: ExpoImageProps["source"];
    dark?: ExpoImageProps["source"];
  };
};

export const Image = ({ source, ...props }: ImageProps) => {
  const { isDarkMode } = useTheme();

  return (
    <ExpoImage
      {...props}
      source={isDarkMode ? (source.dark ?? source.default) : source.default}
    />
  );
};
