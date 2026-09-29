import { useRouter } from "expo-router";
import { View } from "react-native";

import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText } from "@/components/ui/text";
import { DraftFilters } from "@/features/drafts/components/draft-filters";
import { DraftsList } from "@/features/drafts/components/drafts-list";
import { NEW_DRAFT_PARAM } from "@/features/drafts/constants";
import { useDraftsFilters } from "@/features/drafts/hooks/use-drafts-filters";

const DraftsScreen = () => {
  const router = useRouter();
  const { filters, updateFilters } = useDraftsFilters();
  const openNewDraft = () =>
    router.push({
      pathname: "/draft/[draftId]",
      params: { draftId: NEW_DRAFT_PARAM },
    });
  return (
    <AppWrapper scrollable={false} tabBarShown>
      <View className="w-full max-w-2xl min-h-0 flex-1 self-center gap-4">
        <HeadingText
          accessibilityRole="header"
          className="text-3xl font-semibold"
        >
          Drafts
        </HeadingText>
        <View className="min-h-0 flex-1 gap-2">
          <DraftFilters filters={filters} setFilters={updateFilters} />
          <DraftsList
            filters={filters}
            onClearSearch={() => updateFilters({ search: "" })}
            onNewDraft={openNewDraft}
            className="min-h-0"
          />
        </View>
      </View>
    </AppWrapper>
  );
};

export default DraftsScreen;
