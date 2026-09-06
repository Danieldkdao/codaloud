import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText } from "@/components/ui/text";

export const PlaceholderScreen = ({ title }: { title: string }) => (
  // The main layout reserves space for the dock and its bottom safe area.
  <AppWrapper contentContainerStyle={{ justifyContent: "center", paddingBottom: 24 }}>
    <HeadingText
      selectable
      accessibilityRole="header"
      className="text-center text-3xl text-foreground"
    >
      {title}
    </HeadingText>
  </AppWrapper>
);
