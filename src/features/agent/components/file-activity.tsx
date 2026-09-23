import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { useProjectWorkspaceCurrentFile } from "@/features/projects/hooks/use-project-workspace-current-file";
import { flushAgentWorkspace } from "../workspace-access";
import { formatFileActivity } from "../lib/formatters";
import type { FileActivitySchema } from "../schemas";

export const FileActivity = ({
  projectId,
  files,
  onNavigate,
}: {
  projectId: string;
  files: FileActivitySchema[];
  onNavigate?: () => void;
}) => {
  const router = useRouter();
  const workspace = useProjectWorkspaceCurrentFile();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-2">
      {files.map((file) => {
        const presentation = formatFileActivity(file.status);
        return (
          <Pressable
            key={file.path}
            accessibilityRole="button"
            accessibilityLabel={`${presentation.label} ${file.path}. Open file`}
            className="min-h-12 flex-row items-center gap-3 rounded-xl bg-secondary px-3 py-2"
            onPress={() => {
              workspace.openFile(file.path);
              onNavigate?.();
              router.dismissTo({
                pathname: "/projects/[projectId]/code",
                params: { projectId },
              });
            }}
          >
            <Icon
              family="Feather"
              name={presentation.icon}
              size={20}
              className="text-primary"
            />
            <View className="min-w-0 flex-1">
              <PText numberOfLines={2} className="text-foreground">
                {file.path}
              </PText>
              <PText className="text-muted-foreground">
                {presentation.label}
              </PText>
            </View>
            <Icon
              family="Feather"
              name="chevron-right"
              size={18}
              className="text-muted-foreground"
            />
          </Pressable>
        );
      })}
      {files.some((file) => file.status === "changed") ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          className="min-h-11 items-center justify-center rounded-full bg-secondary"
          onPress={async () => {
            if (busy) return;
            setBusy(true);
            setError(undefined);
            try {
              await flushAgentWorkspace(projectId);
              onNavigate?.();
              router.push({
                pathname: "/projects/[projectId]/git/workspace-diff",
                params: { projectId },
              });
            } catch {
              setError("Save your changes before opening the diff.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <PText>{busy ? "Saving…" : "Review changes"}</PText>
        </Pressable>
      ) : null}
      {error ? <PText className="text-destructive">{error}</PText> : null}
    </View>
  );
};
