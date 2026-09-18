import { useQuery } from "@tanstack/react-query";
import { readGitIdentity } from "../git-identity";

export const useGitIdentity = () => useQuery({
  queryKey: ["workspace", "git-identity"], queryFn: readGitIdentity,
  networkMode: "always", retry: false,
});
