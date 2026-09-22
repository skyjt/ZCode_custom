import type { ReactNode } from "react";
import type { CodingPlanEntryInventory } from "@/hooks/useCodingPlanEntryPlanList.js";
import type { CodingPlanUpgradeDialogTarget } from "@/settings/CodingPlanUpgradeDialog.js";

const inventory: CodingPlanEntryInventory = { entryPlanList: "", status: "ready", retry: () => {} };
const disabled = {
  inventory,
  openCodingPlanUpgrade: (
    _target: CodingPlanUpgradeDialogTarget,
    observation?: { signal: AbortSignal; onResult: (opened: boolean) => void },
  ): boolean => {
    observation?.onResult(false);
    return false;
  },
};

// 旧消费方继续得到明确的停用结果，不创建套餐查询或购买面板。
export function CodingPlanUpgradeDialogProvider({ children }: { children: ReactNode }) {
  return children;
}
export function useCodingPlanUpgradeDialog() {
  return disabled;
}
export function useOptionalCodingPlanUpgradeDialog(): typeof disabled | null {
  return null;
}
