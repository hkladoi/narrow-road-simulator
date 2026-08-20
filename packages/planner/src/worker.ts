import type { PlannerWorkerRequest, PlannerWorkerResponse } from "./contracts";
import { planHybridAStar } from "./hybrid-a-star";

export function installPlannerWorker(
  scope: Pick<DedicatedWorkerGlobalScope, "addEventListener" | "postMessage">,
) {
  const cancelled = new Set<string>();
  scope.addEventListener("message", (event: MessageEvent<PlannerWorkerRequest>) => {
    const message = event.data;
    if (message.type === "cancel") {
      cancelled.add(message.requestId);
      return;
    }
    cancelled.delete(message.requestId);
    const result = planHybridAStar(
      message.payload,
      { isCancelled: () => cancelled.has(message.requestId) },
      (expandedNodes) => {
        const progress: PlannerWorkerResponse = {
          type: "progress",
          requestId: message.requestId,
          expandedNodes,
        };
        scope.postMessage(progress);
      },
    );
    const response: PlannerWorkerResponse = {
      type: "result",
      requestId: message.requestId,
      result,
    };
    scope.postMessage(response);
    cancelled.delete(message.requestId);
  });
}
