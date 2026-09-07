import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText } from "@/components/ui/text";
import { GitHubConnection } from "@/services/github/components/github-connection";

const AccountScreen = () => (
  <AppWrapper tabBarShown contentContainerStyle={{ gap: 24 }}>
    <HeadingText
      accessibilityRole="header"
      className="text-3xl text-foreground"
    >
      Account
    </HeadingText>
    <GitHubConnection />
  </AppWrapper>
);

export default AccountScreen;
