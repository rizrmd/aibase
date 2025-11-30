import { create } from "zustand";

interface UtilityStore {
  // Clipboard state
  isCopied: boolean;

  // Auto-scroll state
  shouldAutoScroll: boolean;

  // Example/demo state
  serverResponse: string;

  // Actions for clipboard
  setIsCopied: (isCopied: boolean) => void;
  resetCopied: () => void;

  // Actions for auto-scroll
  setShouldAutoScroll: (should: boolean) => void;

  // Actions for demo
  setServerResponse: (response: string) => void;
}

export const useUtilityStore = create<UtilityStore>((set) => ({
  // Initial state
  isCopied: false,
  shouldAutoScroll: true,
  serverResponse: "",

  // Clipboard actions
  setIsCopied: (isCopied) => set({ isCopied }),
  resetCopied: () => set({ isCopied: false }),

  // Auto-scroll actions
  setShouldAutoScroll: (should) => set({ shouldAutoScroll: should }),

  // Demo actions
  setServerResponse: (response) => set({ serverResponse: response }),
}));
