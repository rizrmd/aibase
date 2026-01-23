import { Conversation } from "../llm/conversation";
import { createLogger } from "../utils/logger";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const logger = createLogger("LLMHandler");

interface ChatCompletionRequest {
    context?: string;
    prompt: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
}

/**
 * Handle POST /api/llm/completion - One-shot LLM completion
 * Expects JSON body: { prompt: "...", context?: "...", model?: "...", ... }
 */
export async function handleChatCompletion(req: Request): Promise<Response> {
    try {
        const body = await req.json() as ChatCompletionRequest;
        const {
            context,
            prompt,
            model,
            temperature,
            max_tokens: maxTokens,
            top_p: topP,
        } = body;

        if (!prompt) {
            return Response.json(
                {
                    success: false,
                    error: "prompt is required"
                },
                { status: 400 }
            );
        }

        // Create a new conversation instance
        // This will automatically add default system prompt and append our context if provided
        const conversation = await Conversation.create({
            systemPrompt: context,
            projectId: "default",
            temperature,
            maxTokens,
            topP: topP,
        });

        // Send message and await the full response (one-shot)
        const responseText = await conversation.sendMessage(prompt);

        return Response.json({
            success: true,
            response: responseText
        });

    } catch (error) {
        logger.error({ error }, "Error in chat completion");
        return Response.json(
            {
                success: false,
                response: error instanceof Error ? error.message : "Failed to generate completion"
            },
            { status: 500 }
        );
    }
}
