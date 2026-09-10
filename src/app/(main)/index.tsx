import { View } from "react-native";

import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText } from "@/components/ui/text";
import { ProjectFilters } from "@/features/projects/components/project-filters";
import { ProjectsList } from "@/features/projects/components/projects-list";
import { useProjectsFilters } from "@/features/projects/hooks/use-projects-filters";

const ProjectsScreen = () => {
  const { filters, updateFilters } = useProjectsFilters();

  return (
    <AppWrapper scrollable={false} tabBarShown>
      <View className="w-full max-w-2xl min-h-0 flex-1 self-center gap-4">
        <HeadingText
          accessibilityRole="header"
          className="text-3xl font-semibold"
        >
          Projects
        </HeadingText>
        <View className="min-h-0 flex-1 gap-2">
          <ProjectFilters filters={filters} setFilters={updateFilters} />
          <ProjectsList
            filters={filters}
            onClearSearch={() => updateFilters({ search: "" })}
            className="min-h-0"
          />
        </View>
      </View>
    </AppWrapper>
  );
};

export default ProjectsScreen;
