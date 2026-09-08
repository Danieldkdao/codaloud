import { AppWrapper } from "@/components/app-wrapper";
import { useSuccessFeedback } from "@/components/success-feedback-provider";
import { Button } from "@/components/ui/button";
import { HeadingText } from "@/components/ui/text";
import { GitHubConnection } from "@/services/github/components/github-connection";

const AccountScreen = () => {
  const showSuccess = useSuccessFeedback();

  return (
    <AppWrapper tabBarShown contentContainerStyle={{ gap: 24 }}>
      <HeadingText
        accessibilityRole="header"
        className="text-3xl text-foreground"
      >
        Account
      </HeadingText>
      <GitHubConnection />
      {/* Temporary control for previewing success feedback. */}
      <Button variant="outline" onPress={() => showSuccess("Changes saved")}>
        Preview success banner
      </Button>
    </AppWrapper>
  );
};

export default AccountScreen;
