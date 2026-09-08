import {
  projectSandboxDispatchBatchSize,
  projectSandboxDispatchBudgetMs,
} from "@/features/projects/constants";
import { submitProjectSandbox } from "@/features/projects/server/dispatch-project-sandbox";
import { readDueProjectSandboxOperationsDb } from "@/features/projects/server/project-operations";
import { reconcileProjectDeletionRuns } from "@/features/projects/server/project-deletion";

export const retryPendingProjectSandboxes = async () => {
  const startedAt = Date.now();
  await reconcileProjectDeletionRuns(startedAt + projectSandboxDispatchBudgetMs);
  const pendingProjectOperations = await readDueProjectSandboxOperationsDb(projectSandboxDispatchBatchSize);
  let submitted = 0;
  let failed = 0;

  for (const operation of pendingProjectOperations) {
    if (Date.now() - startedAt >= projectSandboxDispatchBudgetMs) break;

    try {
      if (await submitProjectSandbox(operation.id, operation.userId)) submitted += 1;
    } catch {
      failed += 1;
      console.error("Unable to confirm sandbox task submission; retry remains scheduled.", {
        operationId: operation.id,
      });
    }
  }

  return { submitted, failed };
};
