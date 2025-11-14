import { db } from './connection';
import { conversations, messages } from './schema';
import { eq } from 'drizzle-orm';

async function testSchema() {
  console.log('Testing database schema...\n');

  try {
    // 1. Create a test conversation
    console.log('1. Creating a test conversation...');
    const [conversation] = await db
      .insert(conversations)
      .values({
        title: 'Test Conversation',
        systemPrompt: 'You are a helpful assistant.',
        configName: 'default',
        modelParams: {
          temperature: 0.7,
          maxTokens: 1000,
        },
        metadata: {
          testFlag: true,
        },
      })
      .returning();

    console.log('✅ Created conversation:', conversation.id);

    // 2. Insert some messages
    console.log('\n2. Inserting messages...');
    await db.insert(messages).values([
      {
        conversationId: conversation.id,
        role: 'system',
        content: 'You are a helpful assistant.',
        sequence: 0,
      },
      {
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello, how are you?',
        sequence: 1,
      },
      {
        conversationId: conversation.id,
        role: 'assistant',
        content: 'I am doing well, thank you for asking!',
        sequence: 2,
      },
    ]);

    console.log('✅ Inserted 3 messages');

    // 3. Query the conversation with messages
    console.log('\n3. Querying conversation with messages...');
    const conversationWithMessages = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversation.id),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.sequence)],
        },
      },
    });

    console.log('\n📊 Conversation Details:');
    console.log('  Title:', conversationWithMessages?.title);
    console.log('  Config:', conversationWithMessages?.configName);
    console.log('  Model Params:', conversationWithMessages?.modelParams);
    console.log('\n💬 Messages:');
    conversationWithMessages?.messages.forEach((msg) => {
      console.log(`  [${msg.role}] ${msg.content}`);
    });

    // 4. Clean up test data
    console.log('\n4. Cleaning up test data...');
    await db.delete(conversations).where(eq(conversations.id, conversation.id));
    console.log('✅ Test data cleaned up');

    console.log('\n✅ All schema tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSchema();
