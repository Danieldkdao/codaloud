import {
  AntDesign,
  Entypo,
  EvilIcons,
  Feather,
  FontAwesome,
  FontAwesome5,
  FontAwesome6,
  Fontisto,
  Foundation,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
  Octicons,
  SimpleLineIcons,
  Zocial,
} from "@expo/vector-icons";
import type fontAwesome5Glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome5Free.json";
import type fontAwesome6Glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome6Free.json";
import { styled } from "nativewind";
import type { ComponentProps, ComponentType } from "react";

// First match wins: preserve existing Font Awesome names, then use alphabetical order.
const iconSets = {
  FontAwesome,
  AntDesign,
  Entypo,
  EvilIcons,
  Feather,
  FontAwesome5,
  FontAwesome6,
  Fontisto,
  Foundation,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
  Octicons,
  SimpleLineIcons,
  Zocial,
};

export type IconFamily = keyof typeof iconSets;

// Expo declares FontAwesome5/6 as `any`; their bundled glyph maps restore name checking.
type IconNameForFamily<Family extends IconFamily> =
  Family extends "FontAwesome5"
    ? keyof typeof fontAwesome5Glyphs
    : Family extends "FontAwesome6"
      ? keyof typeof fontAwesome6Glyphs
      : ComponentProps<(typeof iconSets)[Family]>["name"];

export type IconName = {
  [Family in IconFamily]: IconNameForFamily<Family>;
}[IconFamily];

type SharedIconProps = Omit<ComponentProps<typeof FontAwesome>, "name"> & {
  className?: string;
  /** Font Awesome 5/6 styles; Expo falls back when the glyph lacks that style. */
  regular?: boolean;
  solid?: boolean;
  brand?: boolean;
};

export type IconProps = SharedIconProps &
  (
    | { name: IconName; family?: undefined }
    | {
        [Family in IconFamily]: {
          name: IconNameForFamily<Family>;
          family: Family;
        };
      }[IconFamily]
  );

const families = Object.keys(iconSets) as IconFamily[];

// Create adapters once so rerenders preserve the selected icon's font-loading state.
const styledIconSets = Object.fromEntries(
  families.map((family) => [family, styled(iconSets[family])]),
) as Record<IconFamily, ComponentType<SharedIconProps & { name: IconName }>>;

/** Names resolve automatically; pass `family` to select a particular icon set. */
export const Icon = ({ name, family, ...props }: IconProps) => {
  const resolvedFamily =
    family ??
    families.find((candidate) =>
      Object.hasOwn(iconSets[candidate].getRawGlyphMap(), name),
    );

  if (
    !resolvedFamily ||
    !Object.hasOwn(iconSets[resolvedFamily].getRawGlyphMap(), name)
  ) {
    throw new Error(
      `Unknown icon "${name}"${family ? ` in ${family}` : " in Expo Vector Icons"}.`,
    );
  }

  const IconComponent = styledIconSets[resolvedFamily];

  return <IconComponent {...props} name={name} />;
};
