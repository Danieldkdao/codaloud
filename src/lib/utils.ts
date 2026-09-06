import { clsx, type ClassValue } from "clsx";
import { Alert, Platform } from "react-native";
import { twMerge } from "tailwind-merge";
import { ApiResponse } from "./types";

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
