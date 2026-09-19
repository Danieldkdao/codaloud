import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { useGitHubConnected } from "../hooks/use-github-connected";
import { View } from "react-native";

type GitHubConnectionProps = {
  callbackURL?: string;
};

export const GitHubConnection = ({
  callbackURL = "/account",
}: GitHubConnectionProps) => {
  const {
    isConnected,
    isPending,
    isChecking,
    status,
    connectionError,
    handleConnect,
    handleDisconnect,
  } = useGitHubConnected(callbackURL);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="size-6 items-center justify-center">
          <Icon
            family="Feather"
            name="github"
            size={20}
            className="text-secondary-foreground"
            accessible={false}
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <PText className="text-foreground">GitHub</PText>
          {isConnected && <PText>Connected</PText>}
        </View>
        <Button
          variant="secondary"
          className="rounded-xl px-3"
          accessibilityLabel={
            isConnected ? "Disconnect GitHub" : "Connect GitHub"
          }
          onPress={isConnected ? handleDisconnect : handleConnect}
          loading={isPending || isChecking}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </Button>
      </View>
      {!isConnected && (
        <PText>
          Connect to import and publish repositories. GitHub grants read and
          write access to public and private repositories.
        </PText>
      )}
      {(!isConnected || isPending || isChecking || connectionError) && (
        <PText accessibilityLiveRegion="polite">{status}</PText>
      )}
    </View>
  );
};
