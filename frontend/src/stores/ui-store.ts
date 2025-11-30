import { create } from "zustand";

interface ScriptDetails {
  purpose: string;
  code: string;
  state: "call" | "executing" | "progress" | "result" | "error";
  result?: any;
  error?: string;
}

interface FileToolDetails {
  action: string;
  path?: string;
  newPath?: string;
  state: "call" | "executing" | "progress" | "result" | "error";
  result?: any;
  error?: string;
}

interface UIStore {
  // Dialog states
  selectedScript: ScriptDetails | null;
  selectedFileTool: FileToolDetails | null;
  showInterruptPrompt: boolean;

  // Collapsible states
  isReasoningOpen: boolean;

  // Syntax highlighting states
  highlightedCode: string;
  highlightedResult: string;

  // Textarea state
  textAreaHeight: number;

  // Actions for dialogs
  setSelectedScript: (script: ScriptDetails | null) => void;
  setSelectedFileTool: (fileTool: FileToolDetails | null) => void;
  setShowInterruptPrompt: (show: boolean) => void;
  closeAllDialogs: () => void;

  // Actions for collapsibles
  setReasoningOpen: (isOpen: boolean) => void;

  // Actions for highlighting
  setHighlightedCode: (code: string) => void;
  setHighlightedResult: (result: string) => void;

  // Actions for textarea
  setTextAreaHeight: (height: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  // Initial state
  selectedScript: null,
  selectedFileTool: null,
  showInterruptPrompt: false,
  isReasoningOpen: false,
  highlightedCode: "",
  highlightedResult: "",
  textAreaHeight: 0,

  // Dialog actions
  setSelectedScript: (script) => set({ selectedScript: script }),
  setSelectedFileTool: (fileTool) => set({ selectedFileTool: fileTool }),
  setShowInterruptPrompt: (show) => set({ showInterruptPrompt: show }),
  closeAllDialogs: () => set({
    selectedScript: null,
    selectedFileTool: null,
    showInterruptPrompt: false
  }),

  // Collapsible actions
  setReasoningOpen: (isOpen) => set({ isReasoningOpen: isOpen }),

  // Highlighting actions
  setHighlightedCode: (code) => set({ highlightedCode: code }),
  setHighlightedResult: (result) => set({ highlightedResult: result }),

  // Textarea actions
  setTextAreaHeight: (height) => set({ textAreaHeight: height }),
}));
