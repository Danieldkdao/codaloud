import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { KeyboardAwareView } from "@/components/ui/keyboard-aware-view";
import { ProjectAgentActivityList } from "@/features/projects/components/project-agent-activity-list";
import { ProjectAgentSearch } from "@/features/projects/components/project-agent-search";
import { useAgentTasks } from "@/features/agent/hooks/use-agent-tasks";

const AgentScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const tasks = useAgentTasks().filter(
    (task) => task.request.projectId === projectId,
  );
  const [query, setQuery] = useState("");

  return (
    <KeyboardAwareView
      testID="project-agent-viewport"
      className="flex-1 bg-background"
      style={{ flex: 1 }}
    >
      <ProjectAgentActivityList key={projectId} tasks={tasks} search={query} />
      <ProjectAgentSearch
        query={query}
        onQueryChange={setQuery}
        commandScope={`/projects/${projectId}/agent`}
      />
    </KeyboardAwareView>
  );
};

export default AgentScreen;
