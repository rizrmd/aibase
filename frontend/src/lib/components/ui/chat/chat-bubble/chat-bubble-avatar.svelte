<script lang="ts">
	import * as Avatar from '../../avatar/index.js';
	import type { ChatBubbleAvatarProps } from '../../../../types.js';

	let { src, class: className, fallback, children }: ChatBubbleAvatarProps = $props();
</script>

<Avatar.Root>
	<Avatar.Image {src} alt="avatar" />
	<Avatar.Fallback class={className}>
		{#if children}
			{@render children()}
		{:else}
			{fallback}
		{/if}
	</Avatar.Fallback>
</Avatar.Root>
