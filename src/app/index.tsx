import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import { Stack } from "expo-router";
import { View } from "react-native";

const Index = () => {
  return (
    <>
      <Stack.Screen options={{ title: "Button variants" }} />
      <View className="w-full max-w-sm self-center gap-4">
        <PText className="text-muted-foreground">
          All six variants at the default size. Press each to preview its feedback.
        </PText>
        <Button variant="default">Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </View>
    </>
  );
};

export default Index;
