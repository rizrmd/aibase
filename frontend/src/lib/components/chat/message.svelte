<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		role: 'user' | 'assistant' | 'system';
		content: string;
		class?: string;
	}

	let { role, content, class: className }: Props = $props();

	const isUser = $derived(role === 'user');
	const isAssistant = $derived(role === 'assistant');
	const isSystem = $derived(role === 'system');
</script>

<div
	class={cn(
		'flex w-full mb-4',
		isUser && 'justify-end',
		isAssistant && 'justify-start',
		isSystem && 'justify-center',
		className
	)}
>
	<div
		class={cn(
			'max-w-[80%] rounded-lg px-4 py-3',
			isUser && 'bg-primary text-primary-foreground',
			isAssistant && 'bg-muted text-foreground',
			isSystem && 'bg-accent text-accent-foreground text-sm italic'
		)}
	>
		{#if isSystem}
			<span class="opacity-75">{content}</span>
		{:else}
			<div class="whitespace-pre-wrap wrap-break-word">{content}</div>
		{/if}
	</div>
</div>
