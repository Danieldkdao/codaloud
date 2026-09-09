import { ProjectWorkspacePlaceholder } from "@/features/projects/components/project-workspace-placeholder";
import { SandboxFiles } from "@/features/projects/components/sandbox-files";

const FilesScreen = () => (
  <ProjectWorkspacePlaceholder title="Files" description="No files created">
    <SandboxFiles />
  </ProjectWorkspacePlaceholder>
);

export default FilesScreen;
