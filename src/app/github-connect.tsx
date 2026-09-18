import { Redirect } from "expo-router";
import { useDeviceWorkspace } from "@/features/workspace/hooks/use-device-workspace";

// WebBrowser normally consumes the OAuth return. A cold-start deep link must
// still lead somewhere useful without requiring a Codaloud account.
const GitHubConnectScreen = () => {
  const { workspace } = useDeviceWorkspace();
  return <Redirect href={workspace?.hasEntered ? "/(main)/account" : "/(auth)"} />;
};

export default GitHubConnectScreen;
