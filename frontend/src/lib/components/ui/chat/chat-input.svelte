<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { Textarea } from '../textarea/index.js';

	type ChatInputProps = Omit<WithElementRef<HTMLTextareaAttributes>, 'value' | 'ref'> & {
		value?: string;
		ref?: HTMLElement | null;
	};

	let { class: className, ref = $bindable(null), value = $bindable(''), ...restProps }: ChatInputProps = $props();
</script>

<Textarea
	autocomplete="off"
	bind:ref
	bind:value
	name="message"
	class={[
		'flex h-16 max-h-12 w-full resize-none items-center rounded-md bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
		className
	]}
	{...restProps}
/>
