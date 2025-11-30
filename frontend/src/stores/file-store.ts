import { create } from "zustand";

interface FileStore {
  // File attachment state
  files: File[] | null;
  uploadProgress: number | null;

  // Drag and drop state
  isDragging: boolean;

  // File preview state
  preview: string;

  // Actions for files
  setFiles: (files: File[] | null | ((prev: File[] | null) => File[] | null)) => void;
  addFile: (file: File) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;

  // Actions for upload progress
  setUploadProgress: (progress: number | null) => void;

  // Actions for drag state
  setIsDragging: (isDragging: boolean) => void;

  // Actions for preview
  setPreview: (preview: string) => void;
}

export const useFileStore = create<FileStore>((set) => ({
  // Initial state
  files: null,
  uploadProgress: null,
  isDragging: false,
  preview: "",

  // File actions
  setFiles: (files) => set((state) => ({
    files: typeof files === 'function' ? files(state.files) : files
  })),
  addFile: (file) => set((state) => ({
    files: state.files ? [...state.files, file] : [file]
  })),
  removeFile: (index) => set((state) => ({
    files: state.files?.filter((_, i) => i !== index) || null
  })),
  clearFiles: () => set({ files: null }),

  // Upload progress actions
  setUploadProgress: (progress) => set({ uploadProgress: progress }),

  // Drag state actions
  setIsDragging: (isDragging) => set({ isDragging }),

  // Preview actions
  setPreview: (preview) => set({ preview }),
}));
