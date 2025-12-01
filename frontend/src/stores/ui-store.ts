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

interface GenericToolDetails {
  toolName: string;
  args?: Record<string, any>;
  state: "call" | "executing" | "progress" | "result" | "error";
  result?: any;
  error?: string;
}

interface UIStore {
  // Dialog states
  selectedScript: ScriptDetails | null;
  selectedFileTool: FileToolDetails | null;
  selectedGenericTool: GenericToolDetails | null;
  showInterruptPrompt: boolean;

  // Collapsible states
  isReasoningOpen: boolean;

  // Syntax highlighting states
  highlightedCode: string;
  highlightedResult: string;
  highlightedArgs: string;

  // Textarea state
  textAreaHeight: number;

  // Actions for dialogs
  setSelectedScript: (script: ScriptDetails | null) => void;
  setSelectedFileTool: (fileTool: FileToolDetails | null) => void;
  setSelectedGenericTool: (tool: GenericToolDetails | null) => void;
  setShowInterruptPrompt: (show: boolean) => void;
  closeAllDialogs: () => void;

  // Actions for collapsibles
  setReasoningOpen: (isOpen: boolean) => void;

  // Actions for highlighting
  setHighlightedCode: (code: string) => void;
  setHighlightedResult: (result: string) => void;
  setHighlightedArgs: (args: string) => void;

  // Actions for textarea
  setTextAreaHeight: (height: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  // Initial state
  selectedScript: null,
  selectedFileTool: null,
  selectedGenericTool: null,
  showInterruptPrompt: false,
  isReasoningOpen: false,
  highlightedCode: "",
  highlightedResult: "",
  highlightedArgs: "",
  textAreaHeight: 0,

  // Dialog actions
  setSelectedScript: (script) => set({ selectedScript: script }),
  setSelectedFileTool: (fileTool) => set({ selectedFileTool: fileTool }),
  setSelectedGenericTool: (tool) => set({ selectedGenericTool: tool }),
  setShowInterruptPrompt: (show) => set({ showInterruptPrompt: show }),
  closeAllDialogs: () => set({
    selectedScript: null,
    selectedFileTool: null,
    selectedGenericTool: null,
    showInterruptPrompt: false
  }),

  // Collapsible actions
  setReasoningOpen: (isOpen) => set({ isReasoningOpen: isOpen }),

  // Highlighting actions
  setHighlightedCode: (code) => set({ highlightedCode: code }),
  setHighlightedResult: (result) => set({ highlightedResult: result }),
  setHighlightedArgs: (args) => set({ highlightedArgs: args }),

  // Textarea actions
  setTextAreaHeight: (height) => set({ textAreaHeight: height }),
}));
