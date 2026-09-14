import { View } from "react-native";
import { CodeText, PText } from "@/components/ui/text";
import type { ProjectRepositoryChangeSchema } from "../actions/change-schemas";
import {
  formatProjectChangeCount,
  formatProjectChangeLines,
} from "../lib/formatters";
import { ProjectChangeCheckbox } from "./project-change-checkbox";

type ProjectChangesGroupProps = {
  title: string;
  label: string;
  changes: ProjectRepositoryChangeSchema[];
  selectedPaths: ReadonlySet<string>;
  onToggleChanges: (changes: ProjectRepositoryChangeSchema[]) => void;
};

const getChangeLines = (change: ProjectRepositoryChangeSchema) => {
  const diffs = [change.staged, change.unstaged].filter(
    (diff) => diff?.unavailableReason === null,
  );
  if (diffs.length === 0) return null;

  return formatProjectChangeLines(
    diffs.reduce((total, diff) => total + (diff?.additions ?? 0), 0),
    diffs.reduce((total, diff) => total + (diff?.deletions ?? 0), 0),
  );
};

export const ProjectChangesGroup = ({
  title,
  label,
  changes,
  selectedPaths,
  onToggleChanges,
}: ProjectChangesGroupProps) => {
  if (changes.length === 0) return null;
  const selectedCount = changes.filter((change) =>
    selectedPaths.has(change.path),
  ).length;
  const checked =
    selectedCount === 0
      ? false
      : selectedCount === changes.length
        ? true
        : "mixed";

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <ProjectChangeCheckbox
        checked={checked}
        label={label}
        className="rounded-none px-4"
        onPress={() => onToggleChanges(changes)}
      >
        <PText className="flex-1 text-base font-medium">{title}</PText>
        <PText className="text-base text-muted-foreground">
          {formatProjectChangeCount(changes.length)}
        </PText>
      </ProjectChangeCheckbox>
      {changes.map((change) => {
        const lines = getChangeLines(change);
        return (
          <View key={change.path} className="border-t border-border">
            <ProjectChangeCheckbox
              checked={selectedPaths.has(change.path)}
              label={`Include ${change.path}`}
              className="rounded-none px-4"
              onPress={() => onToggleChanges([change])}
            >
              <View className="min-w-0 flex-1 flex-row items-center gap-3">
                <CodeText
                  className="min-w-0 flex-1 text-base text-foreground"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {change.path}
                </CodeText>
                <View className="shrink-0 flex-row items-center gap-2">
                  {lines ? (
                    <>
                      <CodeText className="text-base text-success-foreground">
                        {lines.additions}
                      </CodeText>
                      <CodeText className="text-base text-destructive">
                        {lines.deletions}
                      </CodeText>
                    </>
                  ) : (
                    <CodeText className="text-base text-muted-foreground">
                      —
                    </CodeText>
                  )}
                </View>
              </View>
            </ProjectChangeCheckbox>
          </View>
        );
      })}
    </View>
  );
};
