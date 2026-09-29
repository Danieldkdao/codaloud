import { useState } from "react";
import { useRouter } from "expo-router";
import { alert } from "@/lib/utils";

export const useImportDraftFile = () => {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const importFile = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const { importDraftFileAction } =
        await import("../actions/import-draft-file");
      const result = await importDraftFileAction();
      if (!result) return;
      if (result.error) return alert(result.message);
      router.push({
        pathname: "/draft/[draftId]",
        params: { draftId: result.data.id },
      });
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Unable to import this file.",
      );
    } finally {
      setImporting(false);
    }
  };
  return { importing, importFile };
};
