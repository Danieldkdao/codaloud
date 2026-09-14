import { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { createProjectCommitSchema } from "../actions/create-commit-schemas";
import { useProjectCommitHistory } from "../hooks/use-project-commit-history";
import { useProjectWorkspaceBranch } from "../hooks/use-project-workspace-branch";
import { useProjectFileSaveRegistry } from "../hooks/use-project-file-save";
import { useProjectChanges } from "../hooks/use-project-changes";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";

export const ProjectCommitForm = ({ visible }: { visible: boolean }) => {
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const { commitSelection } = useProjectWorkspaceChanges();
  const { projectId, isCheckingOut } = useProjectWorkspaceBranch();
  const session = useAuthSession();
  const userId =
    !session.isPending && !session.error ? session.data?.user.id : undefined;
  const { commit } = useProjectCommitHistory(projectId, { enabled: false });
  const { refetch } = useProjectChanges(projectId, { enabled: false });
  const { flushPendingSaves } = useProjectFileSaveRegistry();
  const showSuccess = useSuccessFeedback();
  const blocked = useRef(false);
  useEffect(() => {
    blocked.current = !visible || isCheckingOut || !userId;
  }, [visible, isCheckingOut, userId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const input = createProjectCommitSchema.safeParse({
    message,
    paths: commitSelection.paths,
  });
  const busy = submitting || commit.isPending;
  const canSubmit =
    visible &&
    Boolean(userId) &&
    !isCheckingOut &&
    commitSelection.isReady &&
    input.success &&
    !busy;
  const { width } = useWindowDimensions();
  const card = useThemeColor("card");
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);
  const submit = async () => {
    if (!canSubmit || !input.success || inFlight.current) return;
    // Capture the selection and close the same-tick gap before the button disables.
    inFlight.current = true;
    setSubmitting(true);
    let requestStarted = false;
    try {
      await flushPendingSaves();
      if (!mounted.current || blocked.current) return;
      const refreshed = await refetch();
      if (!mounted.current || blocked.current) return;
      const fresh = refreshed.data;
      if (refreshed.isError || !fresh)
        throw new Error(
          "Unable to refresh changes. Try again before committing.",
        );
      const freshScope = JSON.stringify([
        userId,
        projectId,
        fresh.currentBranch,
        fresh.headSha,
      ]);
      const available = new Set(
        fresh.changes
          .filter((change) => change.kind === "file")
          .map((change) => change.path),
      );
      if (
        freshScope !== commitSelection.scope ||
        fresh.isDetached ||
        fresh.repositoryState === "not-initialized" ||
        !fresh.currentBranch ||
        fresh.changes.some((change) => change.isConflicted) ||
        input.data.paths.some((path) => !available.has(path))
      ) {
        throw new Error(
          "The checkout or selected changes changed. Review the selection before committing.",
        );
      }
      requestStarted = true;
      await commit.mutateAsync(input.data);
      commitSelection.clear();
      if (mounted.current) {
        setMessage("");
        setOpen(false);
      }
      showSuccess("Selected changes committed.");
    } catch (error) {
      // A successful commit can refresh HEAD and unmount this form before its
      // response arrives. Still surface an uncertain result after submission.
      if (mounted.current || requestStarted) {
        Alert.alert(
          "Unable to commit",
          error instanceof Error
            ? error.message
            : "Unable to commit changes. Refresh Git changes before retrying.",
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };
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
              onChangeText={(text) => {
                setMessage(
                  text.length
                    ? text.at(0)?.toLowerCase() + text.slice(1)
                    : text,
                );
              }}
              editable={!busy}
              maxLength={5000}
              accessibilityLabel="Commit message"
              // Put the inset on the wrapper so native multiline padding cannot skew it.
              containerClassName="rounded-2xl bg-background p-3"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
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
              disabled={!canSubmit}
              loading={busy}
              onPress={() => void submit()}
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
