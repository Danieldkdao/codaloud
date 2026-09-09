import { ProjectAgentActivityList } from "@/features/projects/components/project-agent-activity-list";
import { demoAgentActivity } from "@/features/projects/data/demo-agent-activity";

const AgentScreen = () => <ProjectAgentActivityList activities={demoAgentActivity} />;

export default AgentScreen;
