import { ActivityIndicator, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { ProjectWorkspacePlaceholder } from "@/features/projects/components/project-workspace-placeholder";

type ProjectWorkspaceStateProps = {
  title: string;
  description: string;
  icon: "code" | "git-commit" | "activity";
  isLoading?: boolean;
};

export const ProjectWorkspaceState = ({
  title,
  description,
  icon,
  isLoading = false,
}: ProjectWorkspaceStateProps) => (
  <ProjectWorkspacePlaceholder title={title} description={description}>
    {isLoading ? (
      <ActivityIndicator
        size="large"
        className="text-primary"
        accessible={false}
      />
    ) : (
      <View
        className="mb-4 h-20 w-20 items-center justify-center rounded-3xl border border-border bg-card"
        accessible={isLoading}
        accessibilityRole={isLoading ? "progressbar" : undefined}
        accessibilityLabel={isLoading ? title : undefined}
        accessibilityState={{ busy: isLoading }}
        accessibilityLiveRegion="polite"
      >
        <Icon
          family="Feather"
          name={icon}
          size={32}
          className="text-primary"
          accessible={false}
        />
      </View>
    )}
  </ProjectWorkspacePlaceholder>
);
