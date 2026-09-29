import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Image } from "@/components/ui/image";
import type { ImageLoadEventData } from "expo-image";
import { HeadingText, PText } from "@/components/ui/text";
import { formatByteSize } from "@/features/projects/lib/formatters";
import { projectImageUri } from "@/features/projects/lib/project-image-uri";

type ProjectImagePreviewContentProps = {
  projectId: string;
  filePath: string;
  /** Size the folder listing reported, shown next to the pixel dimensions. */
  size?: number;
  dockHeight: number;
};

/**
 * Images have no text to edit, so they are decoded straight from the workspace
 * file and contained to the screen. That keeps the whole picture visible on a
 * phone without loading it into the editor.
 */
export const ProjectImagePreviewContent = ({
  projectId,
  filePath,
  size,
  dockHeight,
}: ProjectImagePreviewContentProps) => {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  // A new key remounts the image so a retried decode actually runs again.
  const [attempt, setAttempt] = useState(0);
  const uri = projectImageUri(projectId, filePath);

  const handleLoad = useCallback(
    (event: ImageLoadEventData) => {
      const { width, height } = event.source;
      setDimensions((current) =>
        current?.width === width && current?.height === height
          ? current
          : { width, height },
      );
    },
    [],
  );

  if (failed) {
    return (
      <View
        className="flex-1 items-center justify-center gap-4 bg-background px-6"
        style={{ paddingBottom: dockHeight }}
      >
        <Icon
          family="Feather"
          name="alert-circle"
          size={32}
          accessible={false}
          className="text-muted-foreground"
        />
        <HeadingText className="text-center text-2xl">
          Can't show this image
        </HeadingText>
        <PText accessibilityRole="alert" className="max-w-100 text-center">
          {`${filePath} is stored with the project but could not be decoded. It may be unreadable, or use a format this device does not support.`}
        </PText>
        <Button
          variant="outline"
          accessibilityLabel="Try showing this image again"
          onPress={() => {
            setFailed(false);
            setDimensions(null);
            setAttempt((current) => current + 1);
          }}
        >
          Try again
        </Button>
      </View>
    );
  }

  return (
    <View
      className="flex-1 items-center justify-center gap-3 bg-background p-4"
      style={{ paddingBottom: dockHeight + 16 }}
    >
      {dimensions === null ? (
        <View
          className="items-center gap-3"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading image"
          accessibilityState={{ busy: true }}
        >
          <ActivityIndicator size="large" className="text-primary" accessible={false} />
          <PText>Reading this image…</PText>
        </View>
      ) : null}
      <Image
        key={attempt}
        source={{ default: uri }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          dimensions
            ? `${filePath}, ${dimensions.width} by ${dimensions.height} pixels`
            : filePath
        }
        style={{ width: "100%", flex: 1, opacity: dimensions ? 1 : 0 }}
        contentFit="contain"
        onLoad={handleLoad}
        onError={() => setFailed(true)}
      />
      {dimensions ? (
        <PText className="text-center text-base text-muted-foreground">
          {`${dimensions.width} × ${dimensions.height} px${
            size === undefined ? "" : ` · ${formatByteSize(size)}`
          }`}
        </PText>
      ) : null}
    </View>
  );
};
