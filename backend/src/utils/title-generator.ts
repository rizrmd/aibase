/**
 * Title Generation Utility
 * Shared helper for generating AI-powered titles for uploaded files
 */

import OpenAI from 'openai';
import { createLogger } from './logger';

const logger = createLogger('TitleGenerator');

export interface TitleGenerationOptions {
  /**
   * System prompt for title generation
   * @default "Generate a concise 3-8 word title for a file based on its content. Return only the title, no quotes."
   */
  systemPrompt?: string;

  /**
   * User prompt content (file-specific context)
   */
  content: string;

  /**
   * Timeout in milliseconds
   * @default 8000
   */
  timeoutMs?: number;

  /**
   * Custom model override
   * @default Uses TITLE_GENERATION_MODEL env var, or OPENAI_MODEL, or "gpt-4o-mini"
   */
  model?: string;

  /**
   * Temperature for generation
   * @default 0.5
   */
  temperature?: number;

  /**
   * Max tokens
   * @default 25
   */
  maxTokens?: number;

  /**
   * Label for logging (e.g., "ExcelDocument", "PdfDocument")
   */
  label?: string;
}

/**
 * Generate an AI-powered title for a file
 *
 * @param options - Title generation options
 * @returns Promise<string | undefined> - Generated title or undefined if failed
 *
 * @example
 * ```typescript
 * const title = await generateTitle({
 *   content: `File: ${fileName}\n\nFirst 500 characters:\n${preview}`,
 *   label: 'MyExtension',
 * });
 * ```
 */
export async function generateTitle(options: TitleGenerationOptions): Promise<string | undefined> {
  const {
    systemPrompt = 'Generate a concise 3-8 word title for a file based on its content. Return only the title, no quotes.',
    content,
    timeoutMs = 8000,
    model: customModel,
    temperature = 0.5,
    maxTokens = 25,
    label = 'TitleGenerator',
  } = options;

  try {
    // Check if API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn({ label }, 'OPENAI_API_KEY not configured, skipping title generation');
      return undefined;
    }

    const openai = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Title generation timeout')), timeoutMs);
    });

    const titleModel = customModel || process.env.TITLE_GENERATION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    logger.debug({ label, model: titleModel, contentLength: content.length }, 'Calling OpenAI API for title generation');

    const response = await Promise.race([
      openai.chat.completions.create({
        model: titleModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      timeoutPromise,
    ]) as any;

    const rawTitle = response.choices[0]?.message?.content?.trim();
    logger.debug({ label, rawTitle: rawTitle ? `"${rawTitle}"` : 'empty/undefined' }, 'Raw title from API');

    if (rawTitle && rawTitle.length > 0 && rawTitle.length < 100) {
      // Remove any surrounding quotes
      const title = rawTitle.replace(/^["']|["']$/g, '');
      logger.info({ label, title }, 'Generated title successfully');
      return title;
    } else {
      logger.warn({ label, rawTitle }, 'Title validation failed');
      return undefined;
    }
  } catch (error: any) {
    logger.warn({ label, error: error.message }, 'Failed to generate title');
    return undefined;
  }
}
