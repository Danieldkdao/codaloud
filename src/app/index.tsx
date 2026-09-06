import { CodeText, HeadingText, PText } from "@/components/text";
import { View } from "react-native";

const Index = () => {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <HeadingText className="text-3xl text-foreground">
        Hello, Codaloud!
      </HeadingText>
      <PText className="text-center text-lg text-muted-foreground">
        Your new theme, in color.
      </PText>
      <View className="w-full max-w-sm gap-3 rounded-xl border border-border bg-card p-4">
        <PText className="text-lg text-card-foreground">Color preview</PText>
        <PText className="rounded-lg bg-primary p-4 text-lg text-primary-foreground">
          Primary · Forest green
        </PText>
        <PText className="rounded-lg bg-secondary p-4 text-lg text-secondary-foreground">
          Secondary · Sage
        </PText>
        <PText className="rounded-lg bg-accent p-4 text-lg text-accent-foreground">
          Accent · Clay
        </PText>
        <CodeText className="text-base text-card-foreground">
          Hello, Codaloud!
        </CodeText>
      </View>
    </View>
  );
};

export default Index;
