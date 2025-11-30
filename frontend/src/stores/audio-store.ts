import { create } from "zustand";

interface AudioStore {
  // Audio recording state
  isListening: boolean;
  isSpeechSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  audioStream: MediaStream | null;

  // Actions
  setIsListening: (isListening: boolean) => void;
  setIsSpeechSupported: (isSupported: boolean) => void;
  setIsRecording: (isRecording: boolean) => void;
  setIsTranscribing: (isTranscribing: boolean) => void;
  setAudioStream: (stream: MediaStream | null) => void;

  // Combined actions
  startRecording: (stream: MediaStream) => void;
  stopRecording: () => void;
  reset: () => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  // Initial state
  isListening: false,
  isSpeechSupported: false,
  isRecording: false,
  isTranscribing: false,
  audioStream: null,

  // Actions
  setIsListening: (isListening) => set({ isListening }),
  setIsSpeechSupported: (isSupported) => set({ isSpeechSupported: isSupported }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setIsTranscribing: (isTranscribing) => set({ isTranscribing }),
  setAudioStream: (stream) => set({ audioStream: stream }),

  // Combined actions
  startRecording: (stream) => set({
    isRecording: true,
    isListening: true,
    audioStream: stream
  }),
  stopRecording: () => set((state) => {
    // Stop all tracks if stream exists
    if (state.audioStream) {
      state.audioStream.getTracks().forEach(track => track.stop());
    }
    return {
      isRecording: false,
      isListening: false,
      audioStream: null
    };
  }),
  reset: () => set((state) => {
    // Stop all tracks if stream exists
    if (state.audioStream) {
      state.audioStream.getTracks().forEach(track => track.stop());
    }
    return {
      isListening: false,
      isRecording: false,
      isTranscribing: false,
      audioStream: null
    };
  }),
}));
