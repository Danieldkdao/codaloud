import { Redirect } from "expo-router";
import { useOnboarding } from "@/features/settings/hooks/use-onboarding";

// WebBrowser normally consumes the OAuth return. A cold-start deep link must
// still lead somewhere useful without requiring a Codaloud account.
const GitHubConnectScreen = () => {
  const { hasCompletedOnboarding } = useOnboarding();
  return <Redirect href={hasCompletedOnboarding ? "/(main)/account" : "/(auth)"} />;
};

export default GitHubConnectScreen;
