import type { ComponentProps } from "react";
import type { Button } from "@/components/ui/button.js";

export function useCodingPlanEntryGate(): {
  status: "loading" | "error" | "ready";
  label: string | undefined;
  retry: () => void;
} {
  return { status: "ready", label: undefined, retry: () => {} };
}

// 所有旧套餐入口共用此组件；API 模式不展示购买按钮。
export function CodingPlanEntryButton(
  _props: ComponentProps<typeof Button> & { bypassGate?: boolean },
): null {
  return null;
}
