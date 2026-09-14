import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme";
import { useProjectWorkspaceChanges } from "../hooks/use-project-workspace-changes";
import { formatProjectChangeSelection } from "../lib/formatters";

export const ProjectCommitForm = ({ visible }: { visible: boolean }) => {
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const { commitSelection } = useProjectWorkspaceChanges();
  const { width } = useWindowDimensions();
  const card = useThemeColor("card");
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);
  // Submission remains disabled until the commit action is implemented.
  return (
    <>
      {visible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open commit form"
          accessibilityHint="Opens the commit message form"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(true)}
          className="items-center justify-center rounded-full active:bg-secondary"
          style={{ width: 48, height: 48 }}
        >
          <Icon
            family="Feather"
            name="git-commit"
            size={22}
            accessible={false}
            className="text-foreground"
          />
        </Pressable>
      ) : null}
      <ContentSheet open={open} onOpenChange={setOpen} backgroundColor={card}>
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === "android" ? "height" : undefined}
          style={{ width }}
        >
          <View
            className="gap-3 bg-card px-5 pb-6 pt-4"
            accessibilityViewIsModal
            onAccessibilityEscape={() => setOpen(false)}
          >
            <PText accessibilityRole="header" className="text-lg font-medium">
              Commit changes
            </PText>
            <Input
              multiline
              value={message}
              onChangeText={setMessage}
              accessibilityLabel="Commit message"
              // Put the inset on the wrapper so native multiline padding cannot skew it.
              containerClassName="rounded-2xl bg-background p-3"
              style={{
                fontFamily: "Outfit_400Regular",
                height: 72,
                padding: 0,
              }}
              scrollEnabled
              textAlignVertical="top"
              placeholder="Describe your changes…"
              className="min-h-0 rounded-none border-0 bg-transparent p-0 focus:border-transparent focus:outline-0"
            />
            <View
              className="flex-row items-center gap-2"
              accessibilityLiveRegion="polite"
            >
              <Icon
                family="Feather"
                name="git-commit"
                size={18}
                className="text-muted-foreground"
                accessible={false}
              />
              <PText className="flex-1 text-base text-muted-foreground">
                {formatProjectChangeSelection(
                  commitSelection.selectedCount,
                  commitSelection.totalCount,
                )}
              </PText>
            </View>
            <Button
              size="lg"
              className="rounded-full"
              disabled
              accessibilityLabel="Commit selected changes"
            >
              Commit selected changes
            </Button>
          </View>
        </KeyboardAvoidingView>
      </ContentSheet>
    </>
  );
};
