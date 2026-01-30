import { create } from "zustand";

/**
 * File context mapping: file ID -> included in LLM context
 */
export interface FileContextMapping {
  [fileId: string]: boolean;
}

interface FileContextStore {
  // File context state
  fileContext: FileContextMapping;
  isLoading: boolean;
  error: string | null;

  // Actions
  setFileContext: (context: FileContextMapping) => void;
  setFileInContext: (fileId: string, included: boolean) => void;
  bulkSetFilesInContext: (fileIds: string[], included: boolean) => void;
  removeFile: (fileId: string) => void;
  clearContext: () => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Check if a file is in context
  isFileInContext: (fileId: string) => boolean;

  // Get count of files in context
  getContextFileCount: () => number;
}

export const useFileContextStore = create<FileContextStore>((set, get) => ({
  // Initial state
  fileContext: {},
  isLoading: false,
  error: null,

  // Set entire file context mapping
  setFileContext: (context) => set({ fileContext: context }),

  // Set whether a specific file is in context
  setFileInContext: (fileId, included) => set((state) => {
    const newContext = { ...state.fileContext };
    if (included) {
      newContext[fileId] = true;
    } else {
      delete newContext[fileId];
    }
    return { fileContext: newContext };
  }),

  // Bulk set multiple files in context
  bulkSetFilesInContext: (fileIds, included) => set((state) => {
    const newContext = { ...state.fileContext };
    for (const fileId of fileIds) {
      if (included) {
        newContext[fileId] = true;
      } else {
        delete newContext[fileId];
      }
    }
    return { fileContext: newContext };
  }),

  // Remove a file from context
  removeFile: (fileId) => set((state) => {
    const newContext = { ...state.fileContext };
    delete newContext[fileId];
    return { fileContext: newContext };
  }),

  // Clear all file context
  clearContext: () => set({ fileContext: {} }),

  // Set loading state
  setIsLoading: (isLoading) => set({ isLoading }),

  // Set error state
  setError: (error) => set({ error }),

  // Check if a file is in context
  isFileInContext: (fileId) => {
    const { fileContext } = get();
    return fileContext[fileId] === true;
  },

  // Get count of files in context
  getContextFileCount: () => {
    const { fileContext } = get();
    return Object.keys(fileContext).filter(fileId => fileContext[fileId] === true).length;
  },
}));
