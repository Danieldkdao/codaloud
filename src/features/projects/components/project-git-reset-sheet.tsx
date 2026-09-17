import { ActionSheet } from "@/components/ui/action-sheet";
import { useProjectHistoryOperations } from "../hooks/use-project-history-operations";
import { gitUndoModes } from "../server/git-undo-schemas";
import {
  formatProjectDiscardChoice,
  formatProjectUndoMode,
} from "../lib/formatters";

export const ProjectGitResetSheet = ({
  kind,
  onClose,
}: {
  kind: "undo" | "discard";
  onClose: () => void;
}) => {
  const { operation, undo, discard } = useProjectHistoryOperations();
  return (
    <ActionSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={kind === "undo" ? "Undo Last Commit" : "Discard Changes"}
      items={
        kind === "undo"
          ? gitUndoModes.map((mode) => ({
              id: mode,
              label: formatProjectUndoMode(mode).label,
              icon: mode === "hard" ? "trash-2" : "corner-up-left",
              disabled: operation.isWorkspaceBusy,
              busy: operation.workspaceOperation === "Undoing last commit…",
              onPress: () => {
                void undo(mode).then((result) => {
                  if (result) onClose();
                });
              },
            }))
          : [false, true].map((includeUntracked) => ({
              id: String(includeUntracked),
              label: formatProjectDiscardChoice(includeUntracked),
              icon: "trash-2",
              disabled: operation.isWorkspaceBusy,
              busy: operation.workspaceOperation === "Discarding changes…",
              onPress: () => {
                void discard(includeUntracked).then((result) => {
                  if (result) onClose();
                });
              },
            }))
      }
    />
  );
};
