import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import { Keyboard, View } from "react-native";
import { useRouter } from "expo-router";
import { cn } from "@/lib/utils";

import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";
import { useProjectWorkspaceFileSearch } from "@/features/projects/hooks/use-project-workspace-file-search";
import type { ProjectFileKind } from "@/features/projects/actions/file-schemas";

export const ProjectFilesAdd = () => {
  const creation = useProjectWorkspaceFileCreation();
  const { projectId, isWorkspaceBusy } = useProjectWorkspaceBranch();
  const { setQuery } = useProjectWorkspaceFileSearch();
  const router = useRouter();
  const disabled = creation.kind !== null || isWorkspaceBusy;
  const begin = (kind: ProjectFileKind) => {
    if (disabled) return;
    Keyboard.dismiss();
    // Creation belongs to the browsed folder, even when invoked from a preview
    // or search results. Reveal the browser before showing its inline form.
    setQuery("");
    creation.begin(kind);
    router.dismissTo({
      pathname: "/projects/[projectId]/files",
      params: { projectId },
    });
  };

  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      accessibilityState={{ disabled }}
      className={cn(disabled && "opacity-50")}
    >
      <NativeSelect
        label="Add file or folder"
        trigger={
          <View className="size-14 items-center justify-center rounded-full">
            <Icon
              family="Feather"
              name="plus"
              size={22}
              accessible={false}
              className="text-foreground"
            />
          </View>
        }
        sections={[
          {
            label: "Add",
            value: creation.kind ?? "",
            options: [
              {
                value: "folder",
                label: "Folder",
                onSelect: () => begin("folder"),
              },
              { value: "file", label: "File", onSelect: () => begin("file") },
            ],
          },
        ]}
      />
    </View>
  );
};
