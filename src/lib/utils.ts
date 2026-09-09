import { clsx, type ClassValue } from "clsx";
import { Alert, Platform } from "react-native";
import { twMerge } from "tailwind-merge";
import type { ApiResponse, ConfirmActionOptions, MaterialIconOptions } from "./types";
import type { Manifest } from "material-icon-theme";
import { getBaseURL } from "./auth/utils";
import { FetchRequestInit } from "expo/fetch";
import z from "zod";

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

export const confirmAction = (
  title: string,
  description: string,
  { cancelText = "Cancel", actionText, onConfirmPress }: ConfirmActionOptions,
) => {
  if (Platform.OS === "web") {
    // Browser confirmation dialogs use the browser's own button labels.
    if (window.confirm(`${title}\n\n${description}`)) onConfirmPress();
    return;
  }

  Alert.alert(title, description, [
    { text: cancelText, style: "cancel" },
    { text: actionText, style: "destructive", onPress: onConfirmPress },
  ]);
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

export const createRequestHeaders = async (
  init?: HeadersInit,
): Promise<Headers> => {
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

export const getContentType = (headers: Headers): string | undefined =>
  headers.get("content-type")?.split(";")[0].trim().toLowerCase();

export const isValidIds = (ids: string | string[]) => {
  const idSchema = z.uuid();
  if (Array.isArray(ids)) {
    return ids.every((id) => idSchema.safeParse(id).success);
  }
  return idSchema.safeParse(ids).success;
};

/** Resolve upstream filename/folder associations to locally bundled SVG artwork. */
export const getMaterialIconXml = ({
  name,
  isDirectory,
  expanded = false,
  light = false,
}: MaterialIconOptions): string => {
  // Utilities also serve API routes; load the artwork only when an icon is requested.
  const { manifest, icons }: { manifest: Manifest; icons: Record<string, string> } =
    require("../../assets/material-icons.json");
  const parts = name.replace(/\\/g, "/").toLowerCase().split("/").filter(Boolean);
  const base = parts.pop() ?? "";
  const parent = parts.pop();
  const overrides = light ? manifest.light : undefined;
  const lookup = (map: Record<string, string> | undefined, key: string) =>
    map && Object.hasOwn(map, key) ? map[key] : undefined;
  const match = (
    field: "fileNames" | "fileExtensions" | "folderNames" | "folderNamesExpanded",
    key: string,
  ) => lookup(overrides?.[field], key) ?? lookup(manifest[field], key);
  const matchName = (field: "fileNames" | "folderNames" | "folderNamesExpanded") =>
    (parent ? match(field, `${parent}/${base}`) : undefined) ?? match(field, base);

  const defaultKey = isDirectory ? (expanded ? "folderExpanded" : "folder") : "file";
  const fallback = overrides?.[defaultKey] ?? manifest[defaultKey] ?? "file";
  let id: string | undefined;

  if (isDirectory) {
    id = matchName(expanded ? "folderNamesExpanded" : "folderNames");
  } else {
    id = matchName("fileNames");
    const segments = base.split(".");
    // Parent associations win; within each group, try the longest extension first.
    for (const prefix of parent ? [`${parent}/`, ""] : [""]) {
      for (let index = 1; !id && index < segments.length; index += 1) {
        id = match("fileExtensions", `${prefix}${segments.slice(index).join(".")}`);
      }
    }
  }

  return lookup(icons, id ?? fallback) ?? lookup(icons, fallback) ?? icons.file;
};
