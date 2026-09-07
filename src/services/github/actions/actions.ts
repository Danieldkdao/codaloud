import type {
  GitHubRepositoryPage,
  ReadGitHubRepositoriesOptions,
} from "@/services/github/types";
import { authClient } from "@/lib/auth/auth-client";
import { PAGE_SIZE } from "@/lib/constants";
import type { ApiResponse } from "@/lib/types";
import { fetchBase } from "@/lib/utils";
import { gitHubRepositoryPageSchema } from "@/services/github/schemas";
import { Platform } from "react-native";

export const readGitHubRepositories = async ({
  signal,
  search,
  cursor,
  pageSize = PAGE_SIZE,
}: ReadGitHubRepositoriesOptions = {}): Promise<GitHubRepositoryPage> => {
  const headers = new Headers({ Accept: "application/json" });
  if (Platform.OS !== "web") {
    const cookie = await authClient.getCookie();
    if (cookie) headers.set("Cookie", cookie);
  }

  const query = new URLSearchParams({
    pageSize: String(pageSize),
  });
  if (cursor != null) query.set("cursor", cursor);
  if (search) query.set("search", search);
  const response = await fetchBase(`/api/github/repositories?${query}`, {
    method: "GET",
    headers,
    credentials: Platform.OS === "web" ? "same-origin" : "omit",
    signal,
  });

  let result: ApiResponse<GitHubRepositoryPage>;
  try {
    result = await response.json();
  } catch {
    signal?.throwIfAborted();
    throw Object.assign(new Error("Unable to read the repository response."), {
      status: response.status,
    });
  }

  if (!response.ok || result?.error) {
    throw Object.assign(
      new Error(result?.message || "Unable to load GitHub repositories."),
      { status: response.status, code: result?.error ? result.code : undefined },
    );
  }
  const page = gitHubRepositoryPageSchema.safeParse(result?.data);
  if (!page.success || (cursor != null && page.data.nextCursor === cursor)) {
    throw new Error("The server returned an invalid repository response.");
  }

  return page.data;
};
