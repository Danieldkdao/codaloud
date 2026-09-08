import { View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";

import { HeadingText, PText } from "@/components/ui/text";
import { SandboxScaffold } from "@/features/projects/components/sandbox-scaffold";

export const ProjectSandboxState = ({ ready }: { ready: boolean }) => (
  <View className="w-full max-w-sm items-center gap-6 self-center">
    <SandboxScaffold ready={ready} />
    <Animated.View
      key={ready ? "ready" : "preparing"}
      entering={FadeIn.duration(280).reduceMotion(ReduceMotion.System)}
      style={{ alignItems: "center", gap: 16 }}
      accessibilityLiveRegion="polite"
    >
      <HeadingText
        selectable
        accessibilityRole="header"
        className="text-center text-3xl text-foreground"
      >
        {ready ? "Your sandbox is ready to go" : "Scaffolding your sandbox"}
      </HeadingText>
      <PText selectable className="text-center text-lg text-muted-foreground">
        {ready
          ? "No files created"
          : "We’re getting everything set up for you. This may take a little while. Feel free to leave and come back later. Setup will keep going."}
      </PText>
    </Animated.View>
  </View>
);
