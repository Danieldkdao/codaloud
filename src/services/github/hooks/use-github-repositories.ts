import { useInfiniteQuery } from "@tanstack/react-query";
import { gitHubRepositoriesQueryOptions } from "../queries/repositories";

export const useGitHubRepositories = (
  options: Parameters<typeof gitHubRepositoriesQueryOptions>[0] = {},
) => useInfiniteQuery(gitHubRepositoriesQueryOptions(options));
