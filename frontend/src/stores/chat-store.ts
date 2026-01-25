import { create } from "zustand";
import type { Message } from "@/components/ui/chat";

interface ChatStore {
  // Messages and input
  messages: Message[];
  input: string;
  isLoading: boolean;
  isHistoryLoading: boolean;
  error: string | null;

  // Connection state
  connectionStatus: string;

  // Processing state (for file uploads, extension processing, etc.)
  processingStatus: string | null;

  // Upload progress message tracking
  uploadingMessageId: string | null;

  // Todos from backend
  todos: any;

  // Max tokens from backend
  maxTokens: number | null;

  // Token usage from backend (cumulative from OpenAI API)
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    messageCount: number;
  } | null;

  // Actions for messages
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;

  // Actions for input
  setInput: (input: string) => void;
  clearInput: () => void;

  // Actions for loading/error
  setIsLoading: (isLoading: boolean) => void;
  setIsHistoryLoading: (isHistoryLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Actions for connection
  setConnectionStatus: (status: string) => void;

  // Actions for processing
  setProcessingStatus: (status: string | null) => void;

  // Actions for todos
  setTodos: (todos: any) => void;

  // Actions for maxTokens
  setMaxTokens: (maxTokens: number | null) => void;

  // Actions for tokenUsage
  setTokenUsage: (tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number; messageCount: number } | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  // Initial state
  messages: [],
  input: "",
  isLoading: false,
  isHistoryLoading: false,
  error: null,
  connectionStatus: "disconnected",
  processingStatus: null,
  todos: null,
  maxTokens: null,
  tokenUsage: null,

  // Message actions
  setMessages: (messages) => set((state) => ({
    messages: typeof messages === 'function' ? messages(state.messages) : messages
  })),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((msg) =>
      msg.id === id ? { ...msg, ...updates } : msg
    )
  })),
  clearMessages: () => set({ messages: [] }),

  // Input actions
  setInput: (input) => set({ input }),
  clearInput: () => set({ input: "" }),

  // Loading/error actions
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsHistoryLoading: (isHistoryLoading) => set({ isHistoryLoading }),
  setError: (error) => set({ error }),

  // Connection actions
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Processing actions
  setProcessingStatus: (status) => set({ processingStatus: status }),

  // Upload progress message tracking
  setUploadingMessageId: (id: string | null) => set({ uploadingMessageId: id }),

  // Todo actions
  setTodos: (todos) => set({ todos }),

  // MaxTokens actions
  setMaxTokens: (maxTokens) => set({ maxTokens }),

  // TokenUsage actions
  setTokenUsage: (tokenUsage) => set({ tokenUsage }),
}));
