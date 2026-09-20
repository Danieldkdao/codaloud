import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useEditorControls } from "../use-editor-controls";

export const UndoRedoButtons = () => {
  const editorControls = useEditorControls()?.state;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        disabled={!editorControls?.canUndo}
        accessibilityState={{ disabled: !editorControls?.canUndo }}
        onPress={() => editorControls?.run("undo")}
        className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon
          family="Feather"
          name="corner-up-left"
          size={22}
          accessible={false}
          className="text-foreground"
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Redo"
        disabled={!editorControls?.canRedo}
        accessibilityState={{ disabled: !editorControls?.canRedo }}
        onPress={() => editorControls?.run("redo")}
        className="h-13 min-w-11 max-w-16 flex-1 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon
          family="Feather"
          name="corner-up-right"
          size={22}
          accessible={false}
          className="text-foreground"
        />
      </Pressable>
    </>
  );
};
