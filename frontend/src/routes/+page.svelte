<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { ChatInput, ChatMessageList } from '$lib/components/ui/chat';
	import {
		ChatBubble,
		ChatBubbleAvatar,
		ChatBubbleMessage
	} from '$lib/components/ui/chat/chat-bubble';
	import { ConversationWebSocket } from '$lib/services/websocket';
	import { client } from '$lib/api/client';
	import { Bot, User } from 'lucide-svelte';
	import MarkdownMessage from '$lib/components/markdown-message.svelte';

	interface ChatMessage {
		role: 'user' | 'assistant' | 'system';
		content: string;
	}

	let messages = $state<ChatMessage[]>([]);
	let isLoading = $state(false);
	let isInitializing = $state(true);
	let conversationId = $state('');
	let ws: ConversationWebSocket;
	let currentAssistantMessage = $state('');
	let connectionStatus = $state<'connecting' | 'connected' | 'disconnected'>('disconnected');
	let inputValue = $state('');
	let inputRef = $state<HTMLTextAreaElement | null>(null);
	let messageListRef = $state<HTMLDivElement | null>(null);

	// Check if user is near bottom (within 90% of scroll height)
	function isNearBottom(element: HTMLDivElement | null): boolean {
		if (!element) return true;
		const threshold = element.scrollHeight * 0.9;
		const position = element.scrollTop + element.clientHeight;
		return position >= threshold;
	}

	// Scroll to bottom only if user is near bottom
	function scrollToBottomIfNearBottom() {
		if (messageListRef && isNearBottom(messageListRef)) {
			requestAnimationFrame(() => {
				if (messageListRef) {
					messageListRef.scrollTop = messageListRef.scrollHeight;
				}
			});
		}
	}

	// Watch for message changes and auto-scroll if near bottom
	$effect(() => {
		if (messages.length > 0 && !isInitializing) {
			scrollToBottomIfNearBottom();
		}
	});

	async function initializeConversation(newConversation = false) {
		isInitializing = true;

		// Get or generate conversation ID
		const STORAGE_KEY = 'current-conversation-id';
		if (newConversation || !conversationId) {
			// Check localStorage for existing conversation ID
			const storedId = !newConversation && typeof window !== 'undefined'
				? localStorage.getItem(STORAGE_KEY)
				: null;

			if (storedId && !newConversation) {
				conversationId = storedId;
			} else {
				// Generate a unique conversation ID
				conversationId = crypto.randomUUID();
				if (typeof window !== 'undefined') {
					localStorage.setItem(STORAGE_KEY, conversationId);
				}
			}
		}

		// Initialize WebSocket if not already connected
		if (!ws) {
			ws = new ConversationWebSocket('/ws');
		}

		try {
			connectionStatus = 'connecting';
			await ws.connect();
			connectionStatus = 'connected';

			// Create or load conversation using oRPC
			// @ts-expect-error - oRPC type compatibility issue
			await client.conversation.create({
				conversationId,
				systemPrompt: 'You are a helpful AI assistant.'
			});

			// Load any existing history (in case of reconnection)
			const history = await ws.getHistory(conversationId);
			if (history && history.length > 0) {
				messages = history.map((msg: any) => ({
					role: msg.role,
					content: msg.content || ''
				}));

				// Always scroll to bottom after loading history on refresh
				// Use multiple animation frames to ensure markdown rendering is complete
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						if (messageListRef) {
							messageListRef.scrollTop = messageListRef.scrollHeight;
						}
					});
				});
			} else {
				messages = [];
			}
		} catch (error) {
			console.error('Failed to connect:', error);
			connectionStatus = 'disconnected';
		} finally {
			isInitializing = false;
		}
	}

	onMount(async () => {
		await initializeConversation();
	});

	onDestroy(() => {
		if (ws) {
			ws.disconnect();
		}
	});

	async function handleSendMessage() {
		const message = inputValue.trim();
		if (!message || !ws || !ws.isConnected() || isLoading) return;

		// Clear input
		inputValue = '';

		// Add user message to the list
		messages = [...messages, { role: 'user', content: message }];
		isLoading = true;
		currentAssistantMessage = '';

		try {
			// Stream the response
			await ws.sendMessage(conversationId, message, (chunk) => {
				const wasFocused = document.activeElement === inputRef;
				currentAssistantMessage += chunk;

				// Update the last message (or add new if it doesn't exist)
				const lastMessage = messages[messages.length - 1];
				if (lastMessage && lastMessage.role === 'assistant') {
					messages[messages.length - 1] = {
						role: 'assistant',
						content: currentAssistantMessage
					};
				} else {
					messages = [...messages, { role: 'assistant', content: currentAssistantMessage }];
				}

				// Restore focus if it was focused before
				if (wasFocused && inputRef) {
					setTimeout(() => inputRef?.focus(), 0);
				}
			});
		} catch (error) {
			console.error('Failed to send message:', error);
			messages = [
				...messages,
				{
					role: 'system',
					content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`
				}
			];
		} finally {
			isLoading = false;
			currentAssistantMessage = '';
		}
	}

	async function handleNewConversation() {
		try {
			// Disconnect existing WebSocket
			if (ws) {
				ws.disconnect();
			}

			// Clear messages
			messages = [];
			conversationId = '';

			// Reinitialize with new conversation
			await initializeConversation(true);
		} catch (error) {
			console.error('Failed to start new conversation:', error);
		}
	}

	async function handleClearHistory() {
		if (!ws || !conversationId) return;

		try {
			// @ts-expect-error - oRPC type compatibility issue
			await client.conversation.clearHistory({
				conversationId,
				keepSystemPrompt: true
			});
			messages = [];
		} catch (error) {
			console.error('Failed to clear history:', error);
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	}
</script>

<svelte:head>
	<title>AI Chat</title>
</svelte:head>

<div class="flex flex-col h-screen bg-background">
	<!-- Header -->
	<header class="border-b bg-card">
		<div class="container flex items-center justify-between h-16 px-4 mx-auto">
			<h1 class="text-2xl font-bold">AI Chat</h1>

			<div class="flex items-center gap-4">
				<!-- Connection Status -->
				<div class="flex items-center gap-2 text-sm">
					<div
						class="w-2 h-2 rounded-full {connectionStatus === 'connected'
							? 'bg-green-500'
							: connectionStatus === 'connecting'
								? 'bg-yellow-500 animate-pulse'
								: 'bg-red-500'}"
					></div>
					<span class="text-muted-foreground">
						{connectionStatus === 'connected'
							? 'Connected'
							: connectionStatus === 'connecting'
								? 'Connecting...'
								: 'Disconnected'}
					</span>
				</div>

				<!-- Action Buttons -->
				<Button
					variant="ghost"
					size="sm"
					onclick={handleNewConversation}
					disabled={connectionStatus === 'connecting' || isInitializing}
				>
					New Conversation
				</Button>

				<Button
					variant="ghost"
					size="sm"
					onclick={handleClearHistory}
					disabled={messages.length === 0}
				>
					Clear History
				</Button>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="flex-1 overflow-hidden flex flex-col">
		<div class="h-full flex flex-col">
			<!-- Messages -->
			<ChatMessageList bind:ref={messageListRef} class="flex-1 container max-w-4xl mx-auto">
				{#if isInitializing}
					<div class="flex items-center justify-center h-full text-muted-foreground">
						<div class="text-center">
							<div class="animate-pulse mb-2">
								<Bot class="w-8 h-8 mx-auto" />
							</div>
							<p class="text-lg font-medium">Loading...</p>
							<p class="text-sm">Connecting to chat server</p>
						</div>
					</div>
				{:else if messages.length === 0}
					<div class="flex items-center justify-center h-full text-muted-foreground">
						<div class="text-center">
							<p class="text-lg font-medium">No messages yet</p>
							<p class="text-sm">Start a conversation by typing a message below</p>
						</div>
					</div>
				{:else}
					{#each messages as message, i (i)}
						{#if message.role === 'system'}
							<div class="flex justify-center my-2">
								<span class="text-sm text-muted-foreground italic bg-muted px-3 py-1 rounded-full">
									{message.content}
								</span>
							</div>
						{:else}
							<ChatBubble variant={message.role === 'user' ? 'sent' : 'received'}>
								<ChatBubbleAvatar
									fallback={message.role === 'user' ? 'U' : 'AI'}
									class={message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}
								>
									{#if message.role === 'user'}
										<User class="w-4 h-4" />
									{:else}
										<Bot class="w-4 h-4" />
									{/if}
								</ChatBubbleAvatar>
								<ChatBubbleMessage
									variant={message.role === 'user' ? 'sent' : 'received'}
									isLoading={i === messages.length - 1 && isLoading && message.role === 'assistant'}
								>
									{#if message.role === 'assistant'}
										<MarkdownMessage content={message.content} />
									{:else}
										<div class="whitespace-pre-wrap break-words">
											{message.content}
										</div>
									{/if}
								</ChatBubbleMessage>
							</ChatBubble>
						{/if}
					{/each}

					{#if isLoading && messages[messages.length - 1]?.role !== 'assistant'}
						<ChatBubble variant="received">
							<ChatBubbleAvatar
								fallback="AI"
								class="bg-secondary text-secondary-foreground"
							>
								<Bot class="w-4 h-4" />
							</ChatBubbleAvatar>
							<ChatBubbleMessage variant="received" isLoading={true} />
						</ChatBubble>
					{/if}
				{/if}
			</ChatMessageList>

			<!-- Input -->
			<div class="border-t p-4 bg-background shrink-0">
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleSendMessage();
					}}
					class="flex gap-2 container h-full max-w-4xl mx-auto"
				>
					<ChatInput
						bind:ref={inputRef}
						value={inputValue}
						oninput={(e: Event) => {
							const target = e.target as HTMLTextAreaElement;
							inputValue = target.value;
						}}
						onkeydown={handleKeyDown}
						placeholder="Type a message..."
						class="flex-1"
					/>
					<Button
						type="submit"
					>
						{#if isLoading}
							<span class="animate-pulse">Sending...</span>
						{:else}
							Send
						{/if}
					</Button>
				</form>
			</div>
		</div>
	</main>
</div>
