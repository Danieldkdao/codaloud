import BottomSheet, { BottomSheetView } from "@expo/ui/community/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ScrollFadeFlatList } from "@/components/ui/scroll-fade-flat-list";
import { PText } from "@/components/ui/text";
import { useProjectBranches } from "@/features/projects/hooks/use-project-branches";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";
import type { ProjectBranchPageSchema } from "@/features/projects/actions/branch-schemas";
import { useUniquePaginatedItems } from "@/hooks/use-unique-paginated-items";
import { useThemeColor } from "@/hooks/use-theme";

const branchSheetSnapPoints = ["60%"];

const getBranches = (page: ProjectBranchPageSchema) => page.branches;
const getBranchKey = (branch: string) => branch;

const formatBranchLoadError = (message: string, hasData: boolean, isNextPageError: boolean) => {
  if (isNextPageError) return "Couldn’t load more branches. Please try again.";
  if (hasData) return "Couldn’t refresh branches. Showing previously loaded branches.";
  return message;
};

export const ProjectBranchSelect = () => {
  const { projectId, branch, setBranch } = useProjectWorkspaceBranch();
  const [search, setSearch] = useState("");
  const query = useProjectBranches(projectId, { search });
  const branches = useUniquePaginatedItems(query.data?.pages, getBranches, getBranchKey);
  const currentBranch = query.data?.pages[0]?.currentBranch;
  useEffect(() => {
    if (branch === null && currentBranch) setBranch(currentBranch);
  }, [branch, currentBranch, setBranch]);
  const sheetRef = useRef<BottomSheet>(null);
  const [open, setOpen] = useState(false);
  const card = useThemeColor("card");
  const close = () => sheetRef.current?.close();

  return (
    <>
      <Pressable
        onPress={() => sheetRef.current?.present()}
        accessibilityRole="button"
        accessibilityLabel={`Branch: ${branch ?? "Select branch"}`}
        accessibilityHint="Opens available branches"
        accessibilityState={{ expanded: open }}
        className="size-12 items-center justify-center rounded-full active:bg-secondary"
      >
        <Icon family="Feather" name="git-branch" size={22} className="text-foreground" accessible={false} />
      </Pressable>
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={branchSheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: card }}
        onChange={(index) => setOpen(index >= 0)}
        onClose={() => setOpen(false)}
      >
        <BottomSheetView style={{ height: "100%" }}>
          <View className="flex-1 bg-card" accessibilityViewIsModal onAccessibilityEscape={close}>
            <View className="flex-row items-center justify-between border-b border-border px-5 py-2">
              <PText accessibilityRole="header" className="flex-1 text-lg font-medium">Branch</PText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close Branch" onPress={close}
                className="size-12 items-center justify-center rounded-full active:bg-secondary">
                <Icon family="Feather" name="x" size={22} className="text-foreground" accessible={false} />
              </Pressable>
            </View>
            <View className="min-h-0 flex-1">
              <ScrollFadeFlatList
                key={`${projectId}:${search.trim().toLowerCase()}`}
                accessibilityLabel="Project branches"
                data={branches}
                extraData={branch}
                keyExtractor={(name) => name}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onEndReached={() => { if (open) query.loadMore(); }}
                onEndReachedThreshold={0.5}
                contentContainerStyle={{ paddingBottom: 4 }}
                ListHeaderComponent={
                  <PText accessibilityRole="header" className="px-5 pt-4 pb-2">Branches</PText>
                }
                ListEmptyComponent={
                  !query.error && query.fetchStatus !== "paused" ? (
                    <View className="items-center gap-3 px-5 py-8">
                      {query.isPending && <ActivityIndicator className="text-foreground" />}
                      <PText accessibilityLiveRegion="polite" className="text-center text-base text-muted-foreground">
                        {query.isPending ? "Loading branches…" : search.trim() ? "No matching branches found." : "No branches found."}
                      </PText>
                    </View>
                  ) : null
                }
                ListFooterComponent={
                  query.fetchStatus === "paused" ? (
                    <PText accessibilityLiveRegion="polite" className="p-5 text-base text-muted-foreground">Waiting for a connection…</PText>
                  ) : query.isFetching && query.data ? (
                    <View className="flex-row items-center justify-center gap-3 p-5">
                      <ActivityIndicator className="text-foreground" />
                      <PText accessibilityLiveRegion="polite" className="text-base text-muted-foreground">
                        {query.isFetchingNextPage ? "Loading more branches…" : "Refreshing branches…"}
                      </PText>
                    </View>
                  ) : query.error ? (
                    <View className="gap-3 p-5">
                      <PText accessibilityRole="alert" className="text-base text-destructive">{formatBranchLoadError(query.error.message, Boolean(query.data), query.isFetchNextPageError)}</PText>
                      <Button variant="outline" onPress={query.retry} loading={query.isFetching}>Try again</Button>
                    </View>
                  ) : query.hasNextPage ? (
                    <View className="p-5">
                      <Button variant="outline" onPress={query.loadMore} disabled={query.isFetching}>Load more branches</Button>
                    </View>
                  ) : null
                }
                renderItem={({ item: name }) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={name}
                    accessibilityState={{ checked: branch === name }}
                    onPress={() => { close(); setBranch(name); }}
                    className="min-h-14 flex-row items-center gap-3 px-5 py-4 active:bg-secondary"
                  >
                    <PText className="min-w-0 flex-1 text-base text-foreground">{name}</PText>
                    {branch === name && (
                      <Icon family="Feather" name="check" size={22} className="text-foreground" accessible={false} />
                    )}
                  </Pressable>
                )}
              />
            </View>
            <View className="flex-row items-center gap-2 border-t border-border px-5 pt-1 pb-4">
              <Icon family="Feather" name="search" size={20} className="text-muted-foreground" accessible={false} />
              <Input type="search" variant="ghost" size="sm" placeholder="Search branches"
                accessibilityLabel="Search branches" autoCapitalize="none" autoCorrect={false}
                value={search} onChangeText={setSearch} maxLength={200}
                containerClassName="min-w-0 flex-1" className="border-0 px-0 py-1 focus:border-transparent focus:outline-0" />
            </View>
          </View>
        </BottomSheetView>
      </BottomSheet>
    </>
  );
};
