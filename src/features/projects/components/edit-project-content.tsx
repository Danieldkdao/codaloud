import { ActivityIndicator, View } from "react-native";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { PText } from "@/components/ui/text";
import { UpdateProjectForm } from "@/features/projects/components/update-project-form";
import { useProject } from "@/features/projects/hooks/use-project";
import { useThemeColor } from "@/hooks/use-theme";

type EditProjectContentProps = {
  projectId: string;
};

export const EditProjectContent = ({ projectId }: EditProjectContentProps) => {
  const { data, isError, isFetching, refetch } = useProject(projectId);
  const primary = useThemeColor("primary");

  // Keep the mounted form and its draft when cached data refreshes.
  if (data) {
    return <UpdateProjectForm defaultValues={{ name: data.name }} />;
  }

  return (
    <AppWrapper scrollable={false} headerShown className="flex-none shrink">
      <View className="min-h-36 items-center justify-center gap-4">
        {isError ? (
          <>
            <PText accessibilityRole="alert" className="text-center text-muted-foreground">
              Unable to load project. Please try again.
            </PText>
            <Button disabled={isFetching} onPress={() => void refetch()}>
              {isFetching ? "Retrying…" : "Try again"}
            </Button>
          </>
        ) : (
          <>
            <ActivityIndicator color={primary} accessibilityLabel="Loading project" />
            <PText className="text-muted-foreground">Loading project…</PText>
          </>
        )}
      </View>
    </AppWrapper>
  );
};
