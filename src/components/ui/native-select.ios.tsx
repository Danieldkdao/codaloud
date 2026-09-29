import {
  Button,
  Host,
  Image,
  Label,
  Menu,
  RNHostView,
  Section,
  Toggle,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  disabled,
  frame,
  resizable,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { Image as NativeImage } from "react-native";

import type { NativeSelectProps } from "@/components/ui/native-select";
import { NativeSelectTrigger } from "@/components/ui/native-select-trigger";
import { useThemeColor } from "@/hooks/use-theme";

export type { NativeSelectProps } from "@/components/ui/native-select";

// The drop-in MenuView discards custom images on iOS. SwiftUI labels preserve
// those images while keeping the system menu animation and selection behavior.
export const NativeSelect = (props: NativeSelectProps) => {
  const foreground = useThemeColor("native-menu-foreground");
  const selectedLabels = props.sections
    .map(
      (section) =>
        section.options.find((option) => option.value === section.value)?.label,
    )
    .filter(Boolean)
    .join(", ");

  return (
    <Host matchContents ignoreSafeArea="all">
      <Menu
        modifiers={[accessibilityLabel(`${props.label}: ${selectedLabels}`)]}
        label={
          <RNHostView matchContents>
            <NativeSelectTrigger {...props} />
          </RNHostView>
        }
      >
        {props.sections.map((section, index) => (
          <Section key={index} title={section.label}>
            {section.options.map((option) => {
              const source =
                option.image && typeof option.image !== "string"
                  ? NativeImage.resolveAssetSource(option.image)
                  : undefined;

              const label = (
                <Label
                  title={option.label}
                  systemImage={
                    typeof option.image === "string" ? option.image : undefined
                  }
                  icon={
                    source?.uri ? (
                      <Image
                        uiImage={source.uri}
                        modifiers={[
                          resizable(),
                          frame({ width: 20, height: 20 }),
                        ]}
                      />
                    ) : undefined
                  }
                />
              );
              if (option.subactions)
                return (
                  <Menu key={option.value} label={label}>
                    {option.subactions.map((child) => (
                      <Button
                        key={child.value}
                        onPress={child.onSelect}
                        modifiers={[tint(foreground)]}
                      >
                        <Label
                          title={child.label}
                          systemImage={
                            typeof child.image === "string"
                              ? child.image
                              : undefined
                          }
                        />
                      </Button>
                    ))}
                  </Menu>
                );
              return section.kind === "actions" ? (
                <Button
                  key={option.value}
                  onPress={option.onSelect}
                  modifiers={[
                    tint(foreground),
                    disabled(Boolean(option.disabled)),
                  ]}
                >
                  {label}
                </Button>
              ) : (
                <Toggle
                  key={option.value}
                  modifiers={[
                    tint(foreground),
                    disabled(Boolean(option.disabled)),
                  ]}
                  isOn={option.value === section.value}
                  onIsOnChange={option.onSelect}
                >
                  {label}
                </Toggle>
              );
            })}
          </Section>
        ))}
      </Menu>
    </Host>
  );
};
