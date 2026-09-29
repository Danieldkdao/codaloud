import { useCallback, useState } from "react";

import type { ProjectImportItem } from "../lib/file-imports";
import { alert } from "@/lib/utils";

export type ProjectUploadState = {
  items: ProjectImportItem[];
  totalBytes: number;
  isPicking: boolean;
  pickFiles: () => Promise<ProjectImportItem[]>;
  pickFolder: () => Promise<ProjectImportItem[]>;
  clear: () => void;
  setItems: (items: ProjectImportItem[]) => void;
};

/**
 * Both upload entry points pick first and import later, so the chosen files are
 * held here while the user confirms. A folder pick replaces the selection; a
 * file pick adds to it, matching how a desktop file manager behaves.
 */
export const useProjectFileUpload = ({
  accumulate = false,
}: {
  /** Repeated file picks build one selection instead of replacing it. */
  accumulate?: boolean;
} = {}): ProjectUploadState => {
  const [items, setItems] = useState<ProjectImportItem[]>([]);
  const [isPicking, setIsPicking] = useState(false);

  const pick = useCallback(
    async (load: () => Promise<ProjectImportItem[] | null>) => {
      if (isPicking) return items;
      setIsPicking(true);
      try {
        // The native picker module is bound only when the user uploads.
        const pickedItems = await load();
        if (pickedItems === null) return items;
        if (pickedItems.length === 0) {
          alert("That selection has no files to upload.");
          return items;
        }
        const next = accumulate ? [...items, ...pickedItems] : pickedItems;
        setItems(next);
        return next;
      } catch (error) {
        const { isProjectPickerCancellation } = await import("../lib/file-imports");
        if (isProjectPickerCancellation(error)) return items;
        alert(
          error instanceof Error
            ? error.message
            : "Unable to choose files on this device.",
        );
        return items;
      } finally {
        setIsPicking(false);
      }
    },
    [accumulate, items, isPicking],
  );

  const pickFiles = useCallback(
    () => pick(async () => (await import("../lib/file-imports")).pickProjectFiles()),
    [pick],
  );
  const pickFolder = useCallback(
    () => pick(async () => (await import("../lib/file-imports")).pickProjectFolder()),
    [pick],
  );

  return {
    items,
    totalBytes: items.reduce((total, item) => total + item.size, 0),
    isPicking,
    pickFiles,
    pickFolder,
    clear: () => setItems([]),
    setItems,
  };
};
