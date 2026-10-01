import { createContext, useContext, useState, type ReactNode } from "react";

type ProjectWorkspaceDockHeightState = {
  dockHeight: number;
  setDockHeight: (height: number) => void;
};

const ProjectWorkspaceDockHeightContext =
  createContext<ProjectWorkspaceDockHeightState | null>(null);
const ProjectWorkspaceDockHeightSetterContext = createContext<
  ((height: number) => void) | null
>(null);

export const ProjectWorkspaceDockHeightProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // Includes the action bar, navigation button, contextual controls, and safe area.
  const [dockHeight, setDockHeight] = useState(0);

  return (
    <ProjectWorkspaceDockHeightSetterContext value={setDockHeight}>
      <ProjectWorkspaceDockHeightContext value={{ dockHeight, setDockHeight }}>
        {children}
      </ProjectWorkspaceDockHeightContext>
    </ProjectWorkspaceDockHeightSetterContext>
  );
};

export const useProjectWorkspaceDockHeight = () => {
  const dockHeight = useContext(ProjectWorkspaceDockHeightContext);
  if (!dockHeight)
    throw new Error(
      "useProjectWorkspaceDockHeight must be used within ProjectWorkspaceDockHeightProvider",
    );
  return dockHeight;
};

export const useProjectWorkspaceDockHeightSetter = () => {
  const setDockHeight = useContext(ProjectWorkspaceDockHeightSetterContext);
  if (!setDockHeight)
    throw new Error(
      "useProjectWorkspaceDockHeightSetter must be used within ProjectWorkspaceDockHeightProvider",
    );
  return setDockHeight;
};
