import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { ContentSheet } from "@/components/ui/content-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/search-input";
import { Icon } from "@/components/ui/icon";
import { HeadingText, PText } from "@/components/ui/text";
import { useDeleteDraft } from "@/features/drafts/hooks/use-delete-draft";
import { useDrafts } from "@/features/drafts/hooks/use-drafts";
import {
  formatDraftInsertMode,
  formatDraftTextScope,
  formatDraftTitle,
} from "@/features/drafts/lib/formatters";
import type {
  DraftInsertMode,
  DraftTextScope,
} from "@/features/drafts/constants";
import type { DraftPageData, DraftResponseData } from "@/features/drafts/types";
import { alert, cn } from "@/lib/utils";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";
import { useEditorPreferences } from "@/features/settings/hooks/use-editor-preferences";

const pageDrafts = (page: DraftPageData) => page.drafts;
const draftKey = (draft: DraftResponseData) => draft.id;

export type DraftInsertSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Range selected in the project file when the sheet opened; equal means a bare cursor. */
  projectSelection: { from: number; to: number } | null;
  /** Resolves once the text is applied AND the project file has been written. */
  onApply: (text: string, mode: DraftInsertMode) => Promise<void>;
};

type Step = "browse" | "text" | "mode" | "done";

export const DraftInsertSheet = ({
  open,
  onOpenChange,
  projectSelection,
  onApply,
}: DraftInsertSheetProps) => {
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<Step>("browse");
  const [chosen, setChosen] = useState<DraftResponseData | null>(null);
  const [excerpt, setExcerpt] = useState("");
  const [selection, setSelection] = useState({ start: 0, length: 0 });
  const [pendingText, setPendingText] = useState("");
  const [pendingScope, setPendingScope] = useState<DraftTextScope>("whole");
  const [error, setError] = useState<string | null>(null);
  const deletion = useDeleteDraft();
  const { preferences } = useEditorPreferences();
  const codeFont = {
    "JetBrains Mono": "JetBrainsMono_400Regular",
    "Fira Code": "FiraCode_400Regular",
    "Source Code Pro": "SourceCodePro_400Regular",
    "IBM Plex Mono": "IBMPlexMono_400Regular",
  }[preferences.font];
  const {
    data,
    isPending,
    isError,
    error: listError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDrafts({ search });
  const drafts = useUniquePaginatedItems(data?.pages, pageDrafts, draftKey);

  const hasProjectSelection = Boolean(
    projectSelection && projectSelection.from !== projectSelection.to,
  );
  const selectedExcerpt = excerpt.slice(
    selection.start,
    selection.start + selection.length,
  );

  const reset = useCallback(() => {
    setStep("browse");
    setChosen(null);
    setExcerpt("");
    setSelection({ start: 0, length: 0 });
    setError(null);
  }, []);

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const apply = async (
    text: string,
    scope: DraftTextScope,
    mode: DraftInsertMode,
  ) => {
    if (text === "") {
      setError("That draft text is empty.");
      return;
    }
    try {
      await onApply(text, mode);
      setPendingText(text);
      setPendingScope(scope);
      setError(null);
      setStep("done");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to insert this draft text.",
      );
    }
  };

  const chooseScope = (scope: DraftTextScope) => {
    const text = scope === "whole" ? excerpt : selectedExcerpt;
    // A project selection needs an explicit replace or keep decision first.
    if (hasProjectSelection) {
      setPendingText(text);
      setPendingScope(scope);
      setStep("mode");
      return;
    }
    void apply(text, scope, "cursor");
  };

  const removeDraft = async () => {
    if (!chosen) return;
    try {
      await deletion.mutateAsync(chosen.id);
      close();
    } catch (cause) {
      alert(
        cause instanceof Error
          ? cause.message
          : "Unable to delete this draft. Please try again.",
      );
    }
  };

  return (
    <ContentSheet
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
    >
      {/* Preserve a native boundary for the nested draft list scroller. */}
      <View collapsable={false} className="gap-4 px-4 pb-8 pt-2">
        <HeadingText
          accessibilityRole="header"
          className="text-2xl font-semibold"
        >
          {step === "browse"
            ? "Insert code from draft"
            : step === "text"
              ? formatDraftTitle(chosen ?? { filename: null })
              : step === "mode"
                ? "Where should it go?"
                : "Inserted"}
        </HeadingText>

        {step === "browse" ? (
          <View className="gap-3">
            <SearchInput
              initialSearch={search}
              onValueChange={setSearch}
              placeholder="Search drafts…"
            />
            <ScrollView
              className="max-h-96"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8 }}
            >
              {isError ? (
                <PText accessibilityRole="alert" className="text-destructive">
                  {listError.message}
                </PText>
              ) : isPending ? (
                <View className="items-center gap-3 py-6">
                  <ActivityIndicator
                    className="text-primary"
                    accessible={false}
                  />
                  <PText>Loading drafts…</PText>
                </View>
              ) : drafts.length === 0 ? (
                <PText className="py-6 text-center text-muted-foreground">
                  {search.trim()
                    ? "No drafts match that search."
                    : "No drafts yet. Create one from the Drafts tab first."}
                </PText>
              ) : (
                drafts.map((draft) => (
                  <Pressable
                    key={draft.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert from ${formatDraftTitle(draft)}`}
                    onPress={() => {
                      setChosen(draft);
                      setExcerpt(draft.content);
                      setSelection({ start: 0, length: 0 });
                      setStep("text");
                    }}
                    className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
                  >
                    <Icon
                      family="Feather"
                      name="file-text"
                      size={22}
                      accessible={false}
                      className="text-muted-foreground"
                    />
                    <View className="min-w-0 flex-1">
                      <PText
                        className="text-lg font-medium text-card-foreground"
                        numberOfLines={1}
                      >
                        {formatDraftTitle(draft)}
                      </PText>
                      <PText
                        className="text-base text-muted-foreground"
                        numberOfLines={1}
                      >
                        {draft.content.split(/\r?\n/)[0]?.trim() ||
                          "No content yet"}
                      </PText>
                    </View>
                  </Pressable>
                ))
              )}
              {hasNextPage && !isPending && !isError ? (
                <Button
                  variant="outline"
                  disabled={isFetchingNextPage}
                  onPress={() => void fetchNextPage({ cancelRefetch: false })}
                >
                  {isFetchingNextPage
                    ? "Loading more drafts…"
                    : "Load more drafts"}
                </Button>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        {step === "text" && chosen ? (
          <View className="gap-3">
            <PText className="text-base text-muted-foreground">
              Select part of the draft, or insert all of it.
            </PText>
            <Input
              value={excerpt}
              onChangeText={setExcerpt}
              multiline
              numberOfLines={10}
              accessibilityLabel="Draft contents"
              accessibilityHint="Select the part you want to insert"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              onSelectionChange={(event) =>
                setSelection({
                  start: event.nativeEvent.selection.start,
                  length:
                    event.nativeEvent.selection.end -
                    event.nativeEvent.selection.start,
                })
              }
              className="min-h-40 font-mono"
              style={{ fontFamily: codeFont, textAlignVertical: "top" }}
            />
            {error ? (
              <PText accessibilityRole="alert" className="text-destructive">
                {error}
              </PText>
            ) : null}
            <View className="gap-2">
              <Button onPress={() => chooseScope("whole")}>
                {formatDraftTextScope("whole")}
              </Button>
              <Button
                variant="outline"
                disabled={selectedExcerpt === ""}
                onPress={() => chooseScope("selected")}
              >
                {formatDraftTextScope("selected")}
              </Button>
              <Button variant="ghost" onPress={reset}>
                Choose another draft
              </Button>
            </View>
          </View>
        ) : null}

        {step === "mode" ? (
          <View className="gap-3">
            <PText className="text-base text-muted-foreground">
              You have text selected in the project file.
            </PText>
            <View className="gap-2">
              {(["replace-selection", "after-selection"] as const).map(
                (mode) => (
                  <Button
                    key={mode}
                    variant={
                      mode === "replace-selection" ? "destructive" : "outline"
                    }
                    onPress={() => void apply(pendingText, pendingScope, mode)}
                  >
                    {formatDraftInsertMode(mode)}
                  </Button>
                ),
              )}
            </View>
            {error ? (
              <PText accessibilityRole="alert" className="text-destructive">
                {error}
              </PText>
            ) : null}
            <Button variant="ghost" onPress={() => setStep("text")}>
              Back
            </Button>
          </View>
        ) : null}

        {step === "done" ? (
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <Icon
                family="Feather"
                name="check-circle"
                size={26}
                accessible={false}
                className="text-primary"
              />
              <PText accessibilityLiveRegion="polite" className="text-lg">
                {`Inserted ${formatDraftTextScope(pendingScope).toLowerCase()}.`}
              </PText>
            </View>
            <PText className="text-base text-muted-foreground">
              The draft stays on this device. Deleting it cannot be undone.
            </PText>
            <View className="gap-2">
              <Button onPress={close}>Keep draft</Button>
              <Button
                variant="destructive"
                className={cn("disabled:opacity-50")}
                disabled={deletion.isPending}
                loading={deletion.isPending}
                onPress={() => void removeDraft()}
              >
                Delete draft
              </Button>
            </View>
          </View>
        ) : null}
      </View>
    </ContentSheet>
  );
};
