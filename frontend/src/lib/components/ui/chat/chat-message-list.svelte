<script lang="ts">
	import type { DivableProps } from '../../../types.js';
	import autoscroll from './hooks/use_autoscroll.svelte.js';
	type ChatMessageListProps = DivableProps & {
		smooth?: boolean;
	};
	let {
		class: className,
		smooth = false,
		ref = $bindable(null),
		children,
		...restProps
	}: ChatMessageListProps = $props();

	let innerRef: HTMLDivElement | null = null;
</script>

<div bind:this={ref} class="chat-items relative h-full w-full overflow-y-auto">
	<div
		bind:this={innerRef}
		use:autoscroll
		class={['flex h-full w-full flex-col', className]}
		{...restProps}
	>
		<div class="flex flex-col gap-6 pb-[200px] ">
			{@render children?.()}
		</div>
	</div>
</div>
