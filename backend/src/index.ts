import { Agent, run } from '@openai/agents';

/**
 * Simple LLM Backend using OpenAI Agents
 *
 * This backend demonstrates how to create and use an AI agent
 * with the @openai/agents SDK.
 */

async function main() {
  try {
    // Check if API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.error('Error: OPENAI_API_KEY environment variable is not set');
      console.log('Please set it using: export OPENAI_API_KEY=your-api-key');
      process.exit(1);
    }

    // Create an agent instance
    const agent = new Agent({
      name: 'SimpleAssistant',
      instructions: 'You are a helpful assistant. Provide clear and concise answers to user questions.',
      model: 'gpt-4o-mini', // Using cost-effective model
    });

    console.log('🤖 Simple LLM Backend Started');
    console.log(`Agent Name: ${agent.name}`);
    console.log(`Model: ${agent.model}`);
    console.log('\n--- Running Example Query ---\n');

    // Example: Run a simple query
    const userMessage = 'Hello! Can you explain what you do in one sentence?';
    console.log(`User: ${userMessage}`);

    const result = await run(agent, userMessage);

    // Display the response
    console.log(`Assistant: ${result.finalOutput}`);
    console.log('\n✅ Backend test completed successfully!');

  } catch (error) {
    console.error('❌ Error running agent:', error);
    process.exit(1);
  }
}

// Run the main function
main();
