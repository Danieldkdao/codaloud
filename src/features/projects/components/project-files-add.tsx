import { useState } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { NativeSelect } from "@/components/ui/native-select";

export const ProjectFilesAdd = () => {
  const [selectedType, setSelectedType] = useState<"folder" | "file" | "">("");

  return (
    <NativeSelect
      label="Add file or folder"
      trigger={
        <View className="items-center justify-center rounded-full" style={{ width: 48, height: 48 }}>
          <Icon family="Feather" name="plus" size={22} accessible={false} className="text-foreground" />
        </View>
      }
      sections={[{
        label: "Add",
        value: selectedType,
        options: [
          { value: "folder", label: "Folder", onSelect: () => setSelectedType("folder") },
          { value: "file", label: "File", onSelect: () => setSelectedType("file") },
        ],
      }]}
    />
  );
};
