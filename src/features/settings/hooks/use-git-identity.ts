import { useQuery } from "@tanstack/react-query";
import { readGitIdentity } from "../git-identity";

export const useGitIdentity = () =>
  useQuery({
    queryKey: ["settings", "git-identity"],
    queryFn: readGitIdentity,
    networkMode: "always",
    retry: false,
  });
