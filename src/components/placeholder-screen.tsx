import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText } from "@/components/ui/text";

export const PlaceholderScreen = ({ title }: { title: string }) => (
  <AppWrapper tabBarShown contentContainerStyle={{ justifyContent: "center" }}>
    <HeadingText
      selectable
      accessibilityRole="header"
      className="text-center text-3xl text-foreground"
    >
      {title}
    </HeadingText>
  </AppWrapper>
);
