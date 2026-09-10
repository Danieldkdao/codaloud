import { use, type ReactNode } from "react";
import { ProjectWorkspaceDockHeightContext } from "@/features/projects/contexts/project-workspace-context";

import { AppWrapper } from "@/components/app-wrapper";
import { HeadingText, PText } from "@/components/ui/text";

type ProjectWorkspacePlaceholderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export const ProjectWorkspacePlaceholder = ({
  title,
  description,
  children,
}: ProjectWorkspacePlaceholderProps) => {
  const dockHeight = use(ProjectWorkspaceDockHeightContext);

  return (
    <AppWrapper
      headerShown
      style={{ marginBottom: dockHeight }}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      contentContainerStyle={{
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
      <HeadingText
        accessibilityRole="header"
        className="text-center text-3xl text-foreground"
      >
        {title}
      </HeadingText>
      {description ? (
        <PText className="text-center text-muted-foreground text-lg">
          {description}
        </PText>
      ) : null}
    </AppWrapper>
  );
};
