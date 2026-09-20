import { Redirect, useLocalSearchParams } from "expo-router";

const ProjectScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  return (
    <Redirect
      href={{ pathname: "/projects/[projectId]/code", params: { projectId } }}
    />
  );
};

export default ProjectScreen;
