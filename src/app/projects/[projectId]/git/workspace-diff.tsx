import { ProjectWorkspaceDiff } from "@/features/projects/components/project-workspace-diff";
import { demoChanges } from "@/features/projects/data/demo-changes";

const WorkspaceDiffScreen = () => <ProjectWorkspaceDiff files={demoChanges} />;

export default WorkspaceDiffScreen;
