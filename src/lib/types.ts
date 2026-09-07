export type ApiResponse<T = never> =
  | { error: true; message: string; code?: string; data?: never }
  | { error: false; message: string; data?: T };

export type ConfirmActionOptions = {
  cancelText?: string;
  actionText: string;
  onConfirmPress: () => void;
};
