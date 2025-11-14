import * as conversationProcedures from './procedures/conversation';

/**
 * Main oRPC router
 * Combines all procedures into a single API
 */
export const router = {
  conversation: {
    create: conversationProcedures.createConversation,
    sendMessage: conversationProcedures.sendMessage,
    getHistory: conversationProcedures.getHistory,
    clearHistory: conversationProcedures.clearHistory,
    delete: conversationProcedures.deleteConversation,
    list: conversationProcedures.listConversations,
  },
};

/**
 * Export router type for client
 */
export type AppRouter = typeof router;
