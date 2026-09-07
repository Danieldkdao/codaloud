import { clsx, type ClassValue } from "clsx";
import { Alert, Platform } from "react-native";
import { twMerge } from "tailwind-merge";
import { ApiResponse } from "./types";
import { getBaseURL } from "./auth/utils";
import { FetchRequestInit } from "expo/fetch";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

export const isError = (error: unknown): error is Error =>
  error instanceof Error ? true : false;

export const alert = (message: string) => {
  if (Platform.OS === "web") {
    window.alert(message);
  } else {
    Alert.alert(message);
  }
};

export const apiResponse = <T = never>(
  body: ApiResponse<T>,
  status: number = 200,
): Response => Response.json(body, { status });

export const fetchBase = (path: string, options?: FetchRequestInit) => {
  const baseURL = getBaseURL()?.replace(/\/$/, "") ?? "";
  return fetch(`${baseURL}${path.startsWith("/") ? "" : "/"}${path}`, options);
};

export const createSearchParams = (
  params: Record<string, string | number | boolean | null | undefined>,
): URLSearchParams =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value != null)
      .map(([key, value]) => [key, String(value)]),
  );

export const createRequestHeaders = async (init?: HeadersInit): Promise<Headers> => {
  const headers = new Headers(init);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (Platform.OS !== "web") {
    // This module also serves API routes; load native auth only when needed.
    const { authClient } = await import("./auth/auth-client");
    const cookie = await authClient.getCookie();
    if (cookie) headers.set("Cookie", cookie);
  }

  return headers;
};
