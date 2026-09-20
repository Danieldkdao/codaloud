import { useMemo } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { CodeText, HeadingText, PText } from "@/components/ui/text";
import {
  formatAgentActivityDate,
  formatAgentActivityKind,
  formatAgentActivityStatus,
} from "@/features/projects/lib/formatters";
import type { ProjectAgentActivityData } from "@/features/projects/types";
import { cn } from "@/lib/utils";

type ProjectAgentActivityListProps = {
  activities: ProjectAgentActivityData[];
  search?: string;
};

const ProjectAgentActivityRow = ({ activity }: { activity: ProjectAgentActivityData }) => {
  const kind = formatAgentActivityKind(activity.kind);
  const status = formatAgentActivityStatus(activity.status);

  return (
    <View className="flex-row gap-3 py-5">
      <View
        className="h-10 w-10 items-center justify-center rounded-xl bg-secondary"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Icon family="Feather" name={kind.icon} size={20} className="text-secondary-foreground" accessible={false} />
      </View>
      <View className="min-w-0 flex-1 gap-3">
        <View className="gap-1">
          <PText selectable className="text-lg font-medium text-foreground">
            {activity.title}
          </PText>
          <PText>{kind.label}</PText>
        </View>
        <PText selectable>
          {activity.description}
        </PText>
        {activity.target ? (
          <CodeText selectable className="text-base text-muted-foreground">
            {activity.target}
          </CodeText>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
          <View className={cn("flex-row items-center gap-1.5 rounded-lg px-2 py-1", status.className)}>
            <Icon family="Feather" name={status.icon} size={14} className={status.textClassName} accessible={false} />
            <PText className={cn("font-medium", status.textClassName)}>{status.label}</PText>
          </View>
          <PText>
            {formatAgentActivityDate(activity.createdAt)}
          </PText>
        </View>
      </View>
    </View>
  );
};

export const ProjectAgentActivityList = ({ activities, search = "" }: ProjectAgentActivityListProps) => {
  const insets = useSafeAreaInsets();
  const term = search.trim().toLowerCase();
  const filteredActivities = useMemo(() => {
    if (!term) return activities;
    return activities.filter((activity) => [
      activity.title,
      activity.description,
      activity.target ?? "",
      formatAgentActivityKind(activity.kind).label,
      formatAgentActivityStatus(activity.status).label,
      formatAgentActivityDate(activity.createdAt),
    ].some((value) => value.toLowerCase().includes(term)));
  }, [activities, term]);

  return (
    <FlatList
      className="flex-1 bg-background"
      data={filteredActivities}
      keyExtractor={(activity) => activity.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: 16,
        paddingLeft: 20 + insets.left,
        paddingRight: 20 + insets.right,
        paddingBottom: 24,
      }}
      ListHeaderComponent={
        <View className="pb-2">
          <HeadingText accessibilityRole="header" className="text-2xl">
            Agent activity
          </HeadingText>
        </View>
      }
      ItemSeparatorComponent={() => <View className="ml-[52px] h-px bg-border" />}
      ListEmptyComponent={
        <View className="items-center gap-3 py-16">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <Icon family="Feather" name="activity" size={26} className="text-secondary-foreground" accessible={false} />
          </View>
          <PText className="text-lg font-medium text-foreground">
            {term ? "No matching activity" : "No activity yet"}
          </PText>
          <PText className="text-center">
            {term ? "Try a different search." : "Your requests and their results will appear here."}
          </PText>
        </View>
      }
      renderItem={({ item }) => <ProjectAgentActivityRow activity={item} />}
    />
  );
};
