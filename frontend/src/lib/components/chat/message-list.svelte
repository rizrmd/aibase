<script lang="ts">
	import { onMount } from 'svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import Message from './message.svelte';
	import { cn } from '$lib/utils';

	interface ChatMessage {
		role: 'user' | 'assistant' | 'system';
		content: string;
	}

	interface Props {
		messages: ChatMessage[];
		isLoading?: boolean;
		class?: string;
	}

	let { messages = [], isLoading = false, class: className }: Props = $props();

	let scrollContainer: HTMLElement;
	let shouldAutoScroll = $state(true);

	// Auto-scroll to bottom when new messages arrive
	$effect(() => {
		if (messages.length && shouldAutoScroll && scrollContainer) {
			setTimeout(() => {
				scrollContainer.scrollTop = scrollContainer.scrollHeight;
			}, 50);
		}
	});

	function handleScroll() {
		if (!scrollContainer) return;

		// Check if user is near the bottom (within 100px)
		const isNearBottom =
			scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;
		shouldAutoScroll = isNearBottom;
	}
</script>

<ScrollArea class={cn('flex-1 h-full', className)}>
	<div bind:this={scrollContainer} onscroll={handleScroll} class="h-full px-4 py-6">
		{#if messages.length === 0}
			<div class="flex items-center justify-center h-full text-muted-foreground">
				<div class="text-center">
					<p class="text-lg font-medium">No messages yet</p>
					<p class="text-sm">Start a conversation by typing a message below</p>
				</div>
			</div>
		{:else}
			{#each messages as message, i (i)}
				<Message role={message.role} content={message.content} />
			{/each}

			{#if isLoading}
				<div class="flex justify-start mb-4">
					<div class="bg-muted rounded-lg px-4 py-3">
						<div class="flex space-x-2">
							<div class="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
							<div class="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
							<div class="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"></div>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</ScrollArea>
