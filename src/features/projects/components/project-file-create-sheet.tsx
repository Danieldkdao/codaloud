import { useRef } from "react";
import { KeyboardAvoidingView, Modal, PanResponder, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PText } from "@/components/ui/text";
import type { CreateProjectFileSchema, ProjectFileKind } from "../actions/file-schemas";
import { ProjectFileNameRow, type ProjectFileNameRowHandle } from "./project-file-name-row";

type ProjectFileCreateSheetProps = {
  kind: ProjectFileKind;
  disabled?: boolean;
  existingNames: readonly string[];
  parentPath: string;
  onCreate: (input: CreateProjectFileSchema) => Promise<void>;
  onCancel: () => void;
};

export const ProjectFileCreateSheet = ({ onCreate, onCancel, disabled, kind, ...props }: ProjectFileCreateSheetProps) => {
  const form = useRef<ProjectFileNameRowHandle>(null);
  const insets = useSafeAreaInsets();
  const cancel = () => form.current?.cancel();
  // Keep swipe cancellation separate from backdrop submission. Native sheet
  // dismissal callbacks don't distinguish these two user intentions.
  const swipe = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_event, gesture) => { if (gesture.dy > 60) cancel(); },
  });
  return (
    <Modal transparent visible animationType="slide" onRequestClose={cancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Pressable accessibilityRole="button" accessibilityLabel="Finish creating file or folder" className="absolute inset-0 bg-foreground/10" onPress={() => form.current?.submit()} />
          <View accessibilityViewIsModal onAccessibilityEscape={cancel} className="rounded-t-3xl bg-card" style={{ paddingBottom: Math.max(20, insets.bottom) }}>
            <View {...swipe.panHandlers} className="items-center gap-3 px-5 pb-2 pt-3">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              <PText accessibilityRole="header" className="text-xl font-semibold text-foreground">{kind === "folder" ? "New folder" : "New file"}</PText>
            </View>
            <ProjectFileNameRow {...props} ref={form} kind={kind} disabled={disabled} mode="create" presentation="sheet" submitOnBlur={false} onSubmit={onCreate} onCancel={onCancel} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
