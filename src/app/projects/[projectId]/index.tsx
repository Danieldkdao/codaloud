import { Redirect, useLocalSearchParams } from "expo-router";

const ProjectScreen = () => {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  return <Redirect href={{ pathname: "/projects/[projectId]/files", params: { projectId } }} />;
};

export default ProjectScreen;
