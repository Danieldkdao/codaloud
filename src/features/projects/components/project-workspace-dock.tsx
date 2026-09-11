import { useRef, useState } from "react";
import { usePathname } from "expo-router";
import { TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconProps } from "@/components/ui/icon";
import { CodeText, PText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { GlassSurface } from "@/components/ui/glass-surface";

import { ProjectActionButtonsLeft, ProjectActionButtonsRight } from "@/features/projects/components/project-action-buttons";
import { useProjectWorkspaceDockHeight } from "@/features/projects/hooks/use-project-workspace-dock-height";
import { useProjectWorkspaceBranch } from "@/features/projects/hooks/use-project-workspace-branch";

type WorkspaceTabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: IconProps;
};

const WorkspaceTabButton = ({
  isFocused,
  label,
  icon,
  style,
  ...props
}: WorkspaceTabButtonProps) => (
  <Pressable
    {...props}
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: isFocused }}
    // TabTrigger passes inline space-between alignment, which overrides classes.
    style={(state) => [
      typeof style === "function" ? style(state) : style,
      { flexDirection: "row", alignItems: "center", justifyContent: "center" },
    ]}
    className={cn(
      "min-h-12 min-w-0 flex-1 items-center justify-center rounded-full px-1 py-3 active:bg-secondary",
      isFocused && "bg-secondary",
    )}
  >
    <View className="flex-row items-center justify-center gap-1.5">
      <Icon
        {...icon}
        size={18}
        accessible={false}
        className={
          isFocused ? "text-secondary-foreground" : "text-muted-foreground"
        }
      />
      <PText
        accessible={false}
        numberOfLines={1}
        className={
          isFocused
            ? "font-medium text-secondary-foreground"
            : undefined
        }
      >
        {label}
      </PText>
    </View>
  </Pressable>
);

export const ProjectWorkspaceDock = () => {
  const { setDockHeight } = useProjectWorkspaceDockHeight();
  const insets = useSafeAreaInsets();
  const dockRef = useRef<View>(null);
  const branchIndicatorRef = useRef<View>(null);
  const [isGitSearchOpen, setIsGitSearchOpen] = useState(false);
  const pathname = usePathname();
  const routeName = pathname.split("/").at(-1);
  const activeTab = routeName === "code" || routeName === "git" || routeName === "agent" ? routeName : "files";
  const branchSelection = useProjectWorkspaceBranch();
  const isGit = activeTab === "git";

  return (
    <View
      ref={dockRef}
      collapsable={false}
      onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: "box-none",
        paddingLeft: 16 + insets.left,
        paddingRight: 16 + insets.right,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <View className="w-full self-center" style={{ maxWidth: 440, gap: 10, pointerEvents: "box-none" }}>
        {isGit ? (
          <View ref={branchIndicatorRef} collapsable={false} className="items-center justify-center" style={{ height: 56 }}>
            {!isGitSearchOpen ? (
              <View testID="branch-indicator" accessibilityLiveRegion="polite"
                className="max-w-full flex-row items-center justify-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5">
                <Icon family="Feather" name="git-branch" size={18} className="text-secondary-foreground" accessible={false} />
                <CodeText className="min-w-0 shrink text-center text-lg font-medium text-secondary-foreground"
                  numberOfLines={1} ellipsizeMode="middle">
                  {branchSelection.branch.name}
                </CodeText>
              </View>
            ) : null}
          </View>
        ) : null}
        <GlassSurface borderRadius={36}>
          <View className="flex-row items-center gap-1 p-1.5">
            <TabTrigger name="files" asChild>
              <WorkspaceTabButton label="Files" icon={{ family: "Feather", name: "folder" }} />
            </TabTrigger>
            <TabTrigger name="code" asChild>
              <WorkspaceTabButton label="Code" icon={{ family: "Ionicons", name: "document-text-outline" }} />
            </TabTrigger>
            <TabTrigger name="git" asChild>
              <WorkspaceTabButton label="Git" icon={{ family: "Feather", name: "git-branch" }} />
            </TabTrigger>
            <TabTrigger name="agent" asChild>
              <WorkspaceTabButton label="Agent" icon={{ family: "Ionicons", name: "sparkles-outline" }} />
            </TabTrigger>
          </View>
        </GlassSurface>

        <View className="w-full self-center" style={{ maxWidth: 360 }}>
          <GlassSurface borderRadius={36}>
            <View className="flex-row items-center p-2">
              <View style={{ flex: 1, minWidth: 0, flexDirection: "row", justifyContent: "center" }}>
                <ProjectActionButtonsLeft tab={activeTab} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Microphone"
                className="size-14 items-center justify-center rounded-full bg-primary active:bg-primary/90">
                <Icon family="Feather" name="mic" size={24} accessible={false} className="text-primary-foreground" />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, flexDirection: "row", justifyContent: "center" }}>
                <ProjectActionButtonsRight
                  tab={activeTab}
                  dockRef={dockRef}
                  branchIndicatorRef={branchIndicatorRef}
                  onGitSearchOpenChange={setIsGitSearchOpen}
                />
              </View>
            </View>
          </GlassSurface>
        </View>
      </View>
    </View>
  );
};
