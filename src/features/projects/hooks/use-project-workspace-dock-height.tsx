import { createContext, useContext, useState, type ReactNode } from "react";

type ProjectWorkspaceDockHeightState = {
  dockHeight: number;
  setDockHeight: (height: number) => void;
};

const ProjectWorkspaceDockHeightContext = createContext<ProjectWorkspaceDockHeightState | null>(null);

export const ProjectWorkspaceDockHeightProvider = ({ children }: { children: ReactNode }) => {
  // Includes both floating surfaces and their bottom safe-area spacing.
  const [dockHeight, setDockHeight] = useState(0);

  return (
    <ProjectWorkspaceDockHeightContext value={{ dockHeight, setDockHeight }}>
      {children}
    </ProjectWorkspaceDockHeightContext>
  );
};

export const useProjectWorkspaceDockHeight = () => {
  const dockHeight = useContext(ProjectWorkspaceDockHeightContext);
  if (!dockHeight) throw new Error("useProjectWorkspaceDockHeight must be used within ProjectWorkspaceDockHeightProvider");
  return dockHeight;
};
