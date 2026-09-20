import { useState } from "react";
import { KeyboardAwareView } from "@/components/ui/keyboard-aware-view";
import { ProjectAgentActivityList } from "@/features/projects/components/project-agent-activity-list";
import { ProjectAgentSearch } from "@/features/projects/components/project-agent-search";
import { demoAgentActivity } from "@/features/projects/data/demo-agent-activity";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useWorkspaceLoadingPreview } from "@/features/projects/hooks/use-workspace-loading-preview";

const AgentScreen = () => {
  const isLoading = useWorkspaceLoadingPreview();
  const [query, setQuery] = useState("");

  return (
    <KeyboardAwareView
      testID="project-agent-viewport"
      className="flex-1 bg-background"
      style={{ flex: 1 }}
    >
      {isLoading ? (
        <ProjectWorkspaceState
          isLoading
          icon="activity"
          title="Loading activity…"
          description="Getting your requests and results ready."
        />
      ) : (
        <ProjectAgentActivityList
          activities={demoAgentActivity}
          search={query}
        />
      )}
      <ProjectAgentSearch query={query} onQueryChange={setQuery} />
    </KeyboardAwareView>
  );
};

export default AgentScreen;
