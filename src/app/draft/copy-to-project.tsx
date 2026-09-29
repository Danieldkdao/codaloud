import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { DraftFolderSelect } from "@/features/drafts/components/draft-folder-select";
import { DraftProjectSelect } from "@/features/drafts/components/draft-project-select";
import { useCopyDraft } from "@/features/drafts/hooks/use-copy-draft";
import { useDeleteDraft } from "@/features/drafts/hooks/use-delete-draft";
import { useDraft } from "@/features/drafts/hooks/use-draft";
import { nextAvailableDraftFilename } from "@/features/drafts/lib/draft-filename";
import {
  formatDraftCopyAction,
  formatDraftTitle,
} from "@/features/drafts/lib/formatters";
import { draftFilenameSchema } from "@/features/drafts/lib/draft-filename";
import type { DraftCopiedFileData } from "@/features/drafts/types";
import type { ProjectResponseData } from "@/features/projects/types";
import { useSuccessFeedback } from "@/hooks/use-success-feedback";
import { alert, isValidIds } from "@/lib/utils";

type CopyStep = "project" | "folder" | "name" | "copied";

const CopySheetLayout = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ maxHeight: height - insets.top - insets.bottom }}
    >
      <AppWrapper
        scrollable={false}
        className="flex-none shrink gap-3"
        style={{
          paddingTop: 20,
          paddingBottom: 16,
          paddingHorizontal: 16,
          marginBottom: Platform.OS === "ios" ? -insets.bottom : 0,
        }}
      >
        <View
          collapsable={false}
          className="relative min-h-10 flex-row items-center justify-center"
        >
          <HeadingText accessibilityRole="header" className="text-2xl">
            {title}
          </HeadingText>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-0"
            accessibilityLabel="Close copy to project"
            onPress={onClose}
          >
            <Icon
              family="Feather"
              name="x"
              size={22}
              accessible={false}
              className="text-foreground"
            />
          </Button>
        </View>
        {children}
      </AppWrapper>
    </KeyboardAvoidingView>
  );
};

const CopyDraftToProjectScreen = () => {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const router = useRouter();
  const showSuccess = useSuccessFeedback();
  const copy = useCopyDraft();
  const deletion = useDeleteDraft();
  const query = useDraft(isValidIds(draftId) ? draftId : null);
  const [step, setStep] = useState<CopyStep>("project");
  const [project, setProject] = useState<ProjectResponseData | null>(null);
  const [directoryPath, setDirectoryPath] = useState("");
  const [filename, setFilename] = useState("");
  const [conflict, setConflict] = useState(false);
  const [copied, setCopied] = useState<DraftCopiedFileData | null>(null);

  const draft = query.data ?? null;
  const filenameError = useMemo(() => {
    if (filename.trim() === "") return "Choose a filename for this draft.";
    const parsed = draftFilenameSchema.safeParse(filename.trim());
    return parsed.success
      ? null
      : (parsed.error.issues[0]?.message ?? "Invalid filename.");
  }, [filename]);
  const busy = copy.isPending || deletion.isPending;

  const chooseProject = useCallback((next: ProjectResponseData) => {
    setProject(next);
    setDirectoryPath("");
    setStep("folder");
  }, []);

  const openNameStep = () => {
    // A named draft keeps its own name; an unnamed one must be named here.
    setFilename((current) => current || (draft?.filename ?? ""));
    setStep("name");
  };

  const submit = async (mode: "create" | "replace") => {
    if (!project || !draft) return;
    const result = await copy.mutateAsync({
      draftId: draft.id,
      projectId: project.id,
      directoryPath,
      filename: filename.trim(),
      mode,
    });
    if (result.error) {
      if (result.code === "FILE_EXISTS" && mode === "create") {
        setConflict(true);
        return;
      }
      setConflict(false);
      alert(`Error: ${result.message}`);
      return;
    }
    setConflict(false);
    setCopied(result.data);
    setStep("copied");
  };

  const renameAfterConflict = () => {
    setConflict(false);
    setFilename((current) =>
      nextAvailableDraftFilename(current, [current.trim()]),
    );
  };

  const deleteDraftAfterCopy = async () => {
    if (!draft) return;
    try {
      await deletion.mutateAsync(draft.id);
      showSuccess("Draft deleted");
      router.dismissTo("/(main)/drafts");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to delete this draft. Please try again.",
      );
    }
  };

  const keepDraft = () => router.back();

  if (query.isError || (isValidIds(draftId) && query.isPending)) {
    return (
      <CopySheetLayout title="Copy to project" onClose={() => router.back()}>
        <HeadingText className="text-2xl font-semibold">
          {query.isError ? "Couldn't load this draft" : "Loading draft…"}
        </HeadingText>
        {query.isError ? (
          <>
            <PText accessibilityRole="alert">{query.error.message}</PText>
            <Button variant="outline" onPress={() => void query.refetch()}>
              Try again
            </Button>
          </>
        ) : null}
      </CopySheetLayout>
    );
  }

  if (step === "copied" && copied) {
    const destination = `${project?.name ?? "project"}/${copied.path}`;
    return (
      <CopySheetLayout title="Copied" onClose={() => router.back()}>
        <View className="flex-row items-center justify-center gap-3">
          <Icon
            family="Feather"
            name="check-circle"
            size={20}
            accessible={false}
            className="text-primary"
          />
          <PText
            accessibilityLiveRegion="polite"
            className="text-xl font-medium"
          >
            {destination} {copied.replaced ? "replaced" : "copied"}
          </PText>
        </View>
        <PText className="text-lg text-muted-foreground text-center">
          The draft stays on this device unless you delete it. Copies are
          independent from now on.
        </PText>
        <View className="gap-3">
          <Button disabled={busy} onPress={keepDraft}>
            Keep draft
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            accessibilityLabel="Delete the source draft"
            onPress={() => void deleteDraftAfterCopy()}
          >
            Delete draft
          </Button>
        </View>
      </CopySheetLayout>
    );
  }

  return (
    <CopySheetLayout title="Copy to project" onClose={() => router.back()}>
      <View collapsable={false} className="min-h-0 shrink gap-3">
        <PText className="text-lg text-muted-foreground text-center">
          {`Copy "${draft ? formatDraftTitle(draft) : "this draft"}" as a new project file.`}
        </PText>
        {step === "project" ? (
          <DraftProjectSelect
            selectedProjectId={project?.id ?? null}
            onSelect={chooseProject}
          />
        ) : null}
        {step === "folder" && project ? (
          <DraftFolderSelect
            projectId={project.id}
            directoryPath={directoryPath}
            disabled={busy}
            onDirectoryChange={setDirectoryPath}
            onChoose={openNameStep}
            onBackToProjects={() => setStep("project")}
          />
        ) : null}
        {step === "name" && project ? (
          <ScrollView
            className="min-h-0"
            style={{ flexGrow: 0, flexShrink: 1, maxHeight: 500 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ gap: 12 }}
          >
            <View className="gap-2">
              <PText
                nativeID="draft-copy-filename"
                className="font-medium text-foreground"
              >
                Filename
              </PText>
              <Input
                value={filename}
                onChangeText={setFilename}
                placeholder="helper.ts"
                accessibilityLabel="Filename in the project"
                accessibilityHint="An extension selects the language of the copied file"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                maxLength={255}
                invalid={Boolean(filenameError) && filename.length > 0}
                disabled={busy}
                className="bg-card/70 text-lg font-mono"
              />
              {filenameError ? (
                <PText
                  accessibilityRole="alert"
                  className="text-base text-destructive"
                >
                  {filenameError}
                </PText>
              ) : null}
            </View>
            <PText className="text-lg font-medium text-foreground">
              {`${project.name}/${directoryPath === "" ? "" : `${directoryPath}/`}${filename.trim() || "…"}`}
            </PText>
            {conflict ? (
              <View
                className="gap-3 rounded-2xl border border-border bg-card p-4"
                accessibilityRole="alert"
              >
                <HeadingText className="text-xl font-medium text-card-foreground">
                  That file already exists
                </HeadingText>
                <PText className="text-base text-muted-foreground">
                  {`"${filename.trim()}" is already in this folder. Nothing has been changed yet.`}
                </PText>
                <View className="gap-2">
                  {(["rename", "replace", "cancel"] as const).map((action) => (
                    <Button
                      key={action}
                      variant={action === "replace" ? "destructive" : "outline"}
                      disabled={busy}
                      accessibilityLabel={formatDraftCopyAction(action).label}
                      onPress={() => {
                        if (action === "cancel") setConflict(false);
                        else if (action === "rename") renameAfterConflict();
                        else void submit("replace");
                      }}
                    >
                      {`${formatDraftCopyAction(action).label} — ${formatDraftCopyAction(action).description}`}
                    </Button>
                  ))}
                </View>
              </View>
            ) : null}
            <Button
              disabled={busy || Boolean(filenameError) || !draft}
              loading={copy.isPending}
              onPress={() => void submit("create")}
            >
              Copy into project
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onPress={() => setStep("folder")}
            >
              Back to folder
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => setStep("project")}
            >
              Choose another project
            </Button>
          </ScrollView>
        ) : null}
      </View>
    </CopySheetLayout>
  );
};

export default CopyDraftToProjectScreen;
