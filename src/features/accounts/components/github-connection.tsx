import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { useGitHubConnected } from "@/features/accounts/hooks/use-github-connected";
import { View } from "react-native";

type GitHubConnectionProps = {
  callbackURL?: string;
};

export const GitHubConnection = ({
  callbackURL = "/account",
}: GitHubConnectionProps) => {
  const { isConnected, isPending, isChecking, status, handleConnect } =
    useGitHubConnected(callbackURL);

  return (
    <View className="gap-4">
      <HeadingText accessibilityRole="header" className="text-xl text-foreground">
        GitHub repositories
      </HeadingText>
      <PText className="text-muted-foreground">
        Connect GitHub to access your repositories. GitHub’s permission includes
        read and write access to public and private repositories.
      </PText>
      <Button onPress={handleConnect} loading={isPending || isChecking}>
        {isConnected ? "Reconnect GitHub" : "Connect GitHub"}
      </Button>
      <PText accessibilityLiveRegion="polite" className="text-muted-foreground">
        {status}
      </PText>
    </View>
  );
};
