import type { CreateProjectFileSchema, ProjectFileKind } from "@/features/projects/actions/file-schemas";
import { ProjectFileNameRow } from "@/features/projects/components/project-file-name-row";

type ProjectFileCreateRowProps = {
  kind: ProjectFileKind;
  parentPath: string;
  onCreate: (input: CreateProjectFileSchema) => Promise<void>;
  onCancel: () => void;
};

export const ProjectFileCreateRow = ({ onCreate, ...props }: ProjectFileCreateRowProps) => (
  <ProjectFileNameRow {...props} mode="create" onSubmit={onCreate} />
);
