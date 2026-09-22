import { useAIbuddyStoreWithDefault } from "@/store/StoreProvider.js";

export function useIsOfficeMode(): boolean {
  return useAIbuddyStoreWithDefault((state) => state.interfaceMode === "office", false);
}
