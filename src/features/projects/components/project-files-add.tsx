import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";
import { useProjectWorkspaceFileCreation } from "@/features/projects/hooks/use-project-workspace-file-creation";

export const ProjectFilesAdd = () => {
  const creation = useProjectWorkspaceFileCreation();
  const disabled = creation.kind !== null;

  return (
    <View pointerEvents={disabled ? "none" : "auto"} accessibilityState={{ disabled }} className={disabled ? "opacity-50" : undefined}>
      <NativeSelect
        label="Add file or folder"
        trigger={
          <View className="items-center justify-center rounded-full" style={{ width: 48, height: 48 }}>
            <Icon family="Feather" name="plus" size={22} accessible={false} className="text-foreground" />
          </View>
        }
        sections={[{
          label: "Add",
          value: creation.kind ?? "",
          options: [
            { value: "folder", label: "Folder", onSelect: () => { if (!disabled) creation.begin("folder"); } },
            { value: "file", label: "File", onSelect: () => { if (!disabled) creation.begin("file"); } },
          ],
        }]}
      />
    </View>
  );
};
