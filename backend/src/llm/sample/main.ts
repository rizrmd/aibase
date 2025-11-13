/**
 * Example usage of the Conversation class with custom tools
 */

import { Conversation, Tool } from "../conversation";

// Example 1: Create a simple weather tool
class WeatherTool extends Tool {
  name = "get_weather";
  description = "Get the current weather for a location";
  parameters = {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city and state, e.g. San Francisco, CA",
      },
      unit: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        description: "The temperature unit to use",
      },
    },
    required: ["location"],
  };

  async execute(args: { location: string; unit?: string }): Promise<any> {
    // In a real implementation, you would call a weather API here
    return {
      location: args.location,
      temperature: 72,
      unit: args.unit || "fahrenheit",
      conditions: "sunny",
    };
  }
}

// Example 2: Create a calculator tool
class CalculatorTool extends Tool {
  name = "calculate";
  description = "Perform basic arithmetic calculations";
  parameters = {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The arithmetic operation to perform",
      },
      a: {
        type: "number",
        description: "First number",
      },
      b: {
        type: "number",
        description: "Second number",
      },
    },
    required: ["operation", "a", "b"],
  };

  async execute(args: { operation: string; a: number; b: number }): Promise<number> {
    switch (args.operation) {
      case "add":
        return args.a + args.b;
      case "subtract":
        return args.a - args.b;
      case "multiply":
        return args.a * args.b;
      case "divide":
        if (args.b === 0) throw new Error("Cannot divide by zero");
        return args.a / args.b;
      default:
        throw new Error(`Unknown operation: ${args.operation}`);
    }
  }
}

// Example 3: Basic usage (non-streaming)
async function basicExample() {
  const conversation = new Conversation({
    systemPrompt: "You are a helpful assistant with access to weather and calculator tools.",
    tools: [new WeatherTool(), new CalculatorTool()],
  });

  const response = await conversation.sendMessage("What's the weather in San Francisco?");
  console.log("Response:", response);

  const response2 = await conversation.sendMessage("What's 15 multiplied by 23?");
  console.log("Response:", response2);
}

// Example 4: Streaming with hooks
async function streamingExample() {
  const conversation = new Conversation({
    systemPrompt: "You are a helpful assistant.",
    tools: [new WeatherTool()],
    hooks: {
      message: {
        before: async (message, history) => {
          console.log(`[Hook] Sending message: ${message}`);
          console.log(`[Hook] Current history length: ${history.length}`);
        },
        start: () => {
          console.log("[Hook] Stream started");
        },
        chunk: (chunk, fullText) => {
          // console.log('--- CHUNK: ' + chunk.length)
          process.stdout.write(chunk); // Write chunks as they arrive
        },
        end: (fullText) => {
          console.log("\n[Hook] Stream ended");
        },
      },
      tools: {
        before: (toolCallId, toolName, args) => {
          console.log(`[Hook] Calling tool: ${toolName} (ID: ${toolCallId})`);
          console.log(`[Hook] Tool args:`, args);
        },
        after: (toolCallId, toolName, args, result) => {
          console.log(`[Hook] Tool ${toolName} (ID: ${toolCallId}) completed with result:`, result);
        },
        error: (toolCallId, toolName, args, error) => {
          console.error(`[Hook] Tool ${toolName} (ID: ${toolCallId}) failed:`, error.message);
        },
      },
      error: (error, context) => {
        console.error(`[Hook] Error in ${context}:`, error.message);
      },
    },
  });

  await conversation.sendMessage("Tell me about the weather in NYC")
}

// Example 5: History management
async function historyExample() {
  const conversation = new Conversation({
    systemPrompt: "You are a helpful assistant.",
    maxHistoryLength: 10, // Keep only last 10 messages
    hooks: {
      history: (history) => {
        console.log(`[Hook] History changed. New length: ${history.length}`);
      },
    },
  });

  // Send messages
  await conversation.sendMessage("Hello!");
  await conversation.sendMessage("What's your name?");

  // Get history
  console.log("Current history:", conversation.history);

  // Manually add a message
  conversation.addMessage({
    role: "user",
    content: "Custom message",
  });

  // Clear history but keep system prompt
  conversation.clearHistory(true);
  console.log("After clear:", conversation.history);
}

// Example 6: Custom configuration
async function customConfigExample() {
  const conversation = new Conversation({
    configName: "default", // Use specific config from ai.json
    systemPrompt: "You are a helpful assistant.",
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
  });

  const response = await conversation.sendMessage("Tell me a joke");
  console.log(response);
}

// Example 7: Dynamic tool registration
async function dynamicToolExample() {
  const conversation = new Conversation({
    systemPrompt: "You are a helpful assistant.",
  });

  // Register tools dynamically
  conversation.registerTool(new WeatherTool());

  const response1 = await conversation.sendMessage("What's the weather?");
  console.log(response1);

  // Add more tools later
  conversation.registerTool(new CalculatorTool());

  const response2 = await conversation.sendMessage("Calculate 10 + 5");
  console.log(response2);

  // Remove a tool
  conversation.unregisterTool("get_weather");
}

// Run examples
if (import.meta.main) {
  // console.log("=== Basic Example ===");
  // await basicExample();

  console.log("\n=== Streaming Example ===");
  await streamingExample();

  // console.log("\n=== History Example ===");
  // await historyExample();
}
