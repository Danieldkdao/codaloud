import Animated, {
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { GlassSurface } from "@/components/ui/glass-surface";
import { enterGlassSurface, exitGlassSurface } from "@/lib/glass-animations";
import { ProjectFileNameRow } from "./project-file-name-row";
import type {
  CreateProjectFileSchema,
  ProjectFileKind,
} from "../actions/file-schemas";

type ProjectFileCreateRowProps = {
  kind: ProjectFileKind;
  disabled?: boolean;
  existingNames: readonly string[];
  parentPath: string;
  onSubmit: (input: CreateProjectFileSchema) => Promise<void>;
  onCancel: () => void;
};

/**
 * Creation and renaming share one look: the name field sits on the glass with no
 * card or heading. The field owns the animation, keeping both states identical.
 */
export const ProjectFileCreateRow = ({
  kind,
  disabled,
  existingNames,
  parentPath,
  onSubmit,
  onCancel,
}: ProjectFileCreateRowProps) => {
  const animatedLayout = LinearTransition.duration(220).reduceMotion(
    ReduceMotion.System,
  );

  return (
    <Animated.View
      entering={enterGlassSurface}
      exiting={exitGlassSurface}
      layout={animatedLayout}
    >
      <GlassSurface borderRadius={16}>
        <ProjectFileNameRow
          mode="create"
          kind={kind}
          disabled={disabled}
          existingNames={existingNames}
          parentPath={parentPath}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </GlassSurface>
    </Animated.View>
  );
};
