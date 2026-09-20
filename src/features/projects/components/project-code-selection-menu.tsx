import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { View, type ImageSourcePropType } from "react-native";
import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { useThemeColor } from "@/hooks/use-theme";

const clipboardActions = ["cut", "copy", "paste", "select-all"] as const;
const codeActions = ["explain", "comment", "fold"] as const;
type SelectionAction =
  (typeof clipboardActions)[number] | (typeof codeActions)[number];

const formatSelectionAction = (
  action: SelectionAction,
): {
  label: string;
  icon: Parameters<typeof MaterialCommunityIcons.getImageSource>[0];
} => {
  switch (action) {
    case "cut":
      return { label: "Cut", icon: "content-cut" };
    case "copy":
      return { label: "Copy", icon: "content-copy" };
    case "paste":
      return { label: "Paste", icon: "content-paste" };
    case "select-all":
      return { label: "Select all", icon: "select-all" };
    case "explain":
      return { label: "Explain to me with AI", icon: "creation-outline" };
    case "comment":
      return { label: "Toggle comment", icon: "comment-plus-outline" };
    case "fold":
      return { label: "Fold selection", icon: "unfold-less-horizontal" };
  }
};

import type {
  EditorCommand,
  EditorCommandState,
} from "@/features/editor/types";

export const ProjectCodeSelectionMenu = ({
  onCommand,
  commands,
}: {
  onCommand?: (command: EditorCommand) => void;
  commands?: EditorCommandState;
} = {}) => {
  const foreground = useThemeColor("foreground");
  const [images, setImages] = useState<
    { action: SelectionAction; image: ImageSourcePropType }[]
  >([]);
  useEffect(() => {
    let active = true;
    // NativeSelect accepts image sources on both platforms; Compose ignores SF
    // Symbol names. Rasterize the bundled glyphs locally for matching menu icons.
    void Promise.all(
      [...clipboardActions, ...codeActions].map(async (action) => ({
        action,
        image: await MaterialCommunityIcons.getImageSource(
          formatSelectionAction(action).icon,
          22,
          foreground,
        ),
      })),
    )
      .then((sources) => {
        if (active)
          setImages(
            sources.flatMap(({ action, image }) =>
              image ? [{ action, image }] : [],
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [foreground]);

  const option = (action: SelectionAction) => ({
    value: action,
    label:
      action === "fold" && commands?.fold === "unfold"
        ? "Unfold selection"
        : formatSelectionAction(action).label,
    disabled:
      action === "explain" ||
      (action === "fold" && (!commands || commands.fold === "unavailable")) ||
      (action === "comment" && !commands?.canComment),
    image: images.find((source) => source.action === action)?.image,
    onSelect: () => {
      if (action !== "explain") onCommand?.(action);
    },
  });

  return (
    <NativeSelect
      label="Selection actions"
      trigger={
        <View className="size-12 items-center justify-center">
          <Icon
            family="MaterialCommunityIcons"
            name="text-box-edit-outline"
            size={22}
            className="text-foreground"
            accessible={false}
          />
        </View>
      }
      sections={[
        {
          label: "Clipboard",
          value: "",
          kind: "actions",
          options: clipboardActions.map(option),
        },
        {
          label: "Code",
          value: "",
          kind: "actions",
          options: codeActions.map(option),
        },
      ]}
    />
  );
};
