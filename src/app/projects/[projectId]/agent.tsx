import { ProjectAgentActivityList } from "@/features/projects/components/project-agent-activity-list";
import { demoAgentActivity } from "@/features/projects/data/demo-agent-activity";
import { ProjectWorkspaceState } from "@/features/projects/components/project-workspace-state";
import { useWorkspaceLoadingPreview } from "@/features/projects/hooks/use-workspace-loading-preview";

const AgentScreen = () => {
  const isLoading = useWorkspaceLoadingPreview();

  if (isLoading) {
    return (
      <ProjectWorkspaceState
        isLoading
        icon="activity"
        title="Loading activity…"
        description="Getting your requests and results ready."
      />
    );
  }

  return <ProjectAgentActivityList activities={demoAgentActivity} />;
};

export default AgentScreen;
