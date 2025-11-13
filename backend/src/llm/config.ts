import { readFileSync, existsSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { Agent, Runner, RunResult, setTracingDisabled } from "@openai/agents";
import { parse } from "jsonc-parser";

setTracingDisabled(true);

/**
 * Find the AI config file (supports both .json and .jsonc)
 * @returns Path to the config file
 */
function getConfigPath(): string {
  const jsonPath = join(__dirname, "../../../config/ai.json");
  const jsoncPath = join(__dirname, "../../../config/ai.jsonc");
  if (existsSync(jsoncPath)) {
    return jsoncPath;
  }
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  throw new Error("Config file not found. Expected config/ai.json or config/ai.jsonc");
}

/**
 * AI Configuration Interface
 */
export interface AIConfig {
  url: string;
  key: string;
  model: string;
}

/**
 * Configuration File Structure
 */
export interface ConfigFile {
  default: AIConfig;
  [key: string]: AIConfig;
}

/**
 * Load AI configuration from config/ai.json
 * @param configName - Name of the configuration to load (defaults to "default")
 * @returns AI configuration object
 */
export function loadAIConfig(configName: string = "default"): AIConfig {
  try {
    const configPath = getConfigPath();
    const configData = readFileSync(configPath, "utf-8");
    const config: ConfigFile = parse(configData);

    if (!config[configName]) {
      throw new Error(
        `Configuration "${configName}" not found in ${configPath}`
      );
    }

    return config[configName];
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load AI config: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Load all AI configurations from config/ai.json
 * @returns All configurations from the config file
 */
export function loadAllAIConfigs(): ConfigFile {
  try {
    const configPath = getConfigPath();
    const configData = readFileSync(configPath, "utf-8");
    return parse(configData);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load AI configs: ${error.message}`);
    }
    throw error;
  }
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
