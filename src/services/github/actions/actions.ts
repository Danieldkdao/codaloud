import type {
  GitHubRepository,
  ReadGitHubRepositoriesOptions,
} from "@/features/projects/types";
import { authClient } from "@/lib/auth/auth-client";
import { DEFAULT_PAGE, PAGE_SIZE } from "@/lib/constants";
import type { ApiResponse } from "@/lib/types";
import { fetchBase } from "@/lib/utils";
import { Platform } from "react-native";

export const readGitHubRepositories = async ({
  signal,
  search,
  page = DEFAULT_PAGE,
  pageSize = PAGE_SIZE,
}: ReadGitHubRepositoriesOptions = {}): Promise<GitHubRepository[]> => {
  const headers = new Headers({ Accept: "application/json" });
  if (Platform.OS !== "web") {
    const cookie = await authClient.getCookie();
    if (cookie) headers.set("Cookie", cookie);
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) query.set("search", search);
  const response = await fetchBase(`/api/github/repositories?${query}`, {
    method: "GET",
    headers,
    credentials: Platform.OS === "web" ? "same-origin" : "omit",
    signal,
  });

  let result: ApiResponse<GitHubRepository[]>;
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
  if (!result || !Array.isArray(result.data)) {
    throw new Error("The server returned an invalid repository response.");
  }

  return result.data;
};
