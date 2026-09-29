import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { HeadingText, PText } from "@/components/ui/text";
import { formatByteSize } from "@/features/projects/lib/formatters";
import { isProjectImagePath } from "@/features/projects/lib/image-files";
import { draftAssetFile } from "../lib/draft-assets";

type DraftAssetPreviewContentProps = {
  draftId: string;
  filename: string;
};

export const DraftAssetPreviewContent = ({
  draftId,
  filename,
}: DraftAssetPreviewContentProps) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const asset = draftAssetFile(draftId);

  if (!isProjectImagePath(filename))
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <HeadingText className="text-center text-2xl font-semibold">{filename}</HeadingText>
        <PText className="text-center text-base text-muted-foreground">
          {`${formatByteSize(asset.size)} stored on this device. Copy it to a project to use it there.`}
        </PText>
      </View>
    );

  if (failed)
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <HeadingText className="text-center text-2xl font-semibold">
          Can't show this image
        </HeadingText>
        <PText accessibilityRole="alert" className="text-center text-base">
          The image is saved with this draft but could not be decoded.
        </PText>
        <Button variant="outline" onPress={() => {
          setFailed(false);
          setDimensions(undefined);
          setAttempt((value) => value + 1);
        }}>
          Try again
        </Button>
      </View>
    );

  return (
    <View className="flex-1 items-center justify-center gap-3 p-4">
      {!dimensions ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading image">
          <ActivityIndicator size="large" className="text-primary" accessible={false} />
        </View>
      ) : null}
      <Image
        key={attempt}
        source={{ default: asset.uri }}
        contentFit="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={dimensions ? `${filename}, ${dimensions.width} by ${dimensions.height} pixels` : filename}
        style={{ width: "100%", flex: 1, opacity: dimensions ? 1 : 0 }}
        onLoad={(event) => setDimensions({ width: event.source.width, height: event.source.height })}
        onError={() => setFailed(true)}
      />
      {dimensions ? (
        <PText className="text-center text-base text-muted-foreground">
          {`${dimensions.width} × ${dimensions.height} px · ${formatByteSize(asset.size)}`}
        </PText>
      ) : null}
    </View>
  );
};
