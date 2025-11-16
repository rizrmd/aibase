import OpenAI from "openai";
import { Agent, Runner, RunResult, setTracingDisabled } from "@openai/agents";

setTracingDisabled(true);

/**
 * AI Configuration Interface
 */
export interface AIConfig {
  url: string;
  key: string;
  model: string;
}

/**
 * Load AI configuration from environment variables
 * @param configName - Name of the configuration to load (defaults to "default")
 * @returns AI configuration object
 */
export function loadAIConfig(configName: string = "default"): AIConfig {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  return {
    url: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    key,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

/**
 * Create a default OpenAI Agent using configuration from config/ai.json
 * @param configName - Name of the configuration to load (defaults to "default")
 * @param agentOptions - Optional agent configuration to override defaults
 * @returns Configured OpenAI Agent instance
 */
export function createOpenAI(configName: string = "default") {
  const config = loadAIConfig(configName);
  return {
    ...config,
    client: new OpenAI({
      baseURL: config.url,
      apiKey: config.key,
      defaultHeaders: {
        "X-Stainless-Lang": "js",
        "X-Stainless-Package-Version": "4.0.0",
        "X-Stainless-Runtime": "bun",
        "X-Stainless-Runtime-Version": Bun.version,
      },
    }),
  };
}

/**
 * Create a Runner instance with tracing disabled
 * @param configName - Name of the configuration to load (defaults to "default")
 * @returns Configured Runner instance
 */
export function createRunner(configName: string = "default") {
  const runner = new Runner();
  runner.config.tracingDisabled = true;

  return runner;
}
