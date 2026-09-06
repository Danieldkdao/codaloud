import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import { Stack } from "expo-router";
import { ScrollView, View } from "react-native";

const Index = () => {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ alignItems: "center", padding: 24 }}
    >
      <Stack.Screen options={{ title: "Button variants" }} />
      <View className="w-full max-w-sm gap-4">
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
    </ScrollView>
  );
};

export default Index;
