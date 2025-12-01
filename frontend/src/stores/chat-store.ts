import { create } from "zustand";
import type { Message } from "@/components/ui/chat";

interface ChatStore {
  // Messages and input
  messages: Message[];
  input: string;
  isLoading: boolean;
  error: string | null;

  // Connection state
  connectionStatus: string;

  // Todos from backend
  todos: any;

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
  setError: (error: string | null) => void;

  // Actions for connection
  setConnectionStatus: (status: string) => void;

  // Actions for todos
  setTodos: (todos: any) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  // Initial state
  messages: [],
  input: "",
  isLoading: false,
  error: null,
  connectionStatus: "disconnected",
  todos: null,

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
  setError: (error) => set({ error }),

  // Connection actions
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Todo actions
  setTodos: (todos) => set({ todos }),
}));
