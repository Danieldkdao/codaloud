import { View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";

import { HeadingText, PText } from "@/components/ui/text";
import { SandboxFiles } from "@/features/projects/components/sandbox-files";
import { SandboxScaffold } from "@/features/projects/components/sandbox-scaffold";

export const ProjectSandboxState = ({ ready, restoring = false }: { ready: boolean; restoring?: boolean }) => (
  <View className="w-full max-w-sm items-center gap-6 self-center">
    {ready ? <SandboxFiles /> : <SandboxScaffold />}
    <Animated.View
      key={ready ? "ready" : "preparing"}
      entering={FadeIn.duration(280).reduceMotion(ReduceMotion.System)}
      style={{ alignItems: "center", gap: 16 }}
      accessibilityLiveRegion="polite"
    >
      <HeadingText
        selectable
        accessibilityRole="header"
        className="text-center text-3xl"
      >
        {ready ? "Ready when you are" : restoring ? "We’re starting your sandbox" : "Scaffolding your sandbox"}
      </HeadingText>
      <PText selectable className="text-center text-lg">
        {ready
          ? "Your sandbox is ready to go. You can start coding now!"
          : restoring
            ? "We’re restoring your workspace. This may take a little while. Your files and tabs will be available once it’s ready."
            : "We’re getting everything set up for you. This may take a little while. Feel free to leave and come back later. Setup will keep going."}
      </PText>
    </Animated.View>
  </View>
);
