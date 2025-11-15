<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';

	interface Props {
		onSend: (message: string) => void;
		disabled?: boolean;
		placeholder?: string;
		class?: string;
	}

	let { onSend, disabled = false, placeholder = 'Type a message...', class: className }: Props = $props();

	let message = $state('');

	function handleSubmit(e: Event) {
		e.preventDefault();

		const trimmedMessage = message.trim();
		if (trimmedMessage && !disabled) {
			onSend(trimmedMessage);
			message = '';
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		// Submit on Enter (without Shift)
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	}
</script>

<form onsubmit={handleSubmit} class={cn('flex gap-2 p-4 border-t bg-background', className)}>
	<Input
		bind:value={message}
		onkeydown={handleKeyDown}
		{placeholder}
		{disabled}
		class="flex-1"
		autofocus
	/>
	<Button type="submit" {disabled} class="px-6">
		{#if disabled}
			<span class="animate-pulse">Sending...</span>
		{:else}
			Send
		{/if}
	</Button>
</form>
