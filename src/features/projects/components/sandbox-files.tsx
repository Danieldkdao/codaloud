import { View } from "react-native";

import { CodeText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";

type CodeFileProps = {
  left: number;
  top: number;
  rotation: `${number}deg`;
  featured?: boolean;
};

const CodeFile = ({ left, top, rotation, featured = false }: CodeFileProps) => {
  const background = useThemeColor("background");
  const secondary = useThemeColor("secondary");
  const foreground = useThemeColor("secondary-foreground");
  const shadow = useThemeColor("navigation-shadow");

  return (
    <View
      style={{
        position: "absolute",
        left,
        top,
        width: featured ? 104 : 76,
        height: featured ? 140 : 110,
        borderWidth: 1,
        borderColor: foreground,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: background,
        transform: [{ rotate: rotation }],
        boxShadow: featured ? [{ offsetX: 0, offsetY: 6, blurRadius: 16, color: shadow }] : undefined,
      }}
    >
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 20,
          height: 20,
          borderLeftWidth: 1,
          borderBottomWidth: 1,
          borderColor: foreground,
          borderTopRightRadius: 13,
          borderBottomLeftRadius: 7,
          backgroundColor: secondary,
        }}
      />
      <View style={{ flex: 1, padding: featured ? 14 : 12, paddingTop: 30, gap: 12 }}>
        <View
          style={{
            height: featured ? 46 : 28,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            borderCurve: "continuous",
            backgroundColor: secondary,
          }}
        >
          <CodeText className="text-secondary-foreground" style={{ fontSize: featured ? 26 : 16 }}>
            {featured ? "</>" : "{}"}
          </CodeText>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ width: "76%", height: 3, borderRadius: 2, backgroundColor: foreground, opacity: 0.45 }} />
          <View style={{ width: "56%", height: 3, marginLeft: 8, borderRadius: 2, backgroundColor: foreground, opacity: 0.3 }} />
          <View style={{ width: "64%", height: 3, borderRadius: 2, backgroundColor: foreground, opacity: 0.2 }} />
        </View>
      </View>
    </View>
  );
};

export const SandboxFiles = () => (
  <View
    style={{ width: 224, height: 204 }}
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
  >
    <CodeFile left={12} top={63} rotation="-14deg" />
    <CodeFile left={136} top={63} rotation="14deg" />
    <CodeFile left={60} top={28} rotation="0deg" featured />
  </View>
);
