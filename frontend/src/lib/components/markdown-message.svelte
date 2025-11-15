<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import hljs from 'highlight.js';
	import DOMPurify from 'dompurify';

	let { content = '', class: className = '' }: { content: string; class?: string } = $props();

	let htmlContent = $state('');

	// Configure marked with highlight.js for syntax highlighting
	marked.use({
		renderer: {
			code({ text, lang }: { text: string; lang?: string; escaped?: boolean }) {
				if (lang && hljs.getLanguage(lang)) {
					try {
						return `<pre><code class="hljs language-${lang}">${hljs.highlight(text, { language: lang }).value}</code></pre>`;
					} catch (err) {
						console.error('Highlight error:', err);
					}
				}
				return `<pre><code class="hljs">${hljs.highlightAuto(text).value}</code></pre>`;
			}
		}
	});

	marked.setOptions({
		breaks: true, // Convert \n to <br>
		gfm: true, // GitHub Flavored Markdown
	});

	// Render markdown to HTML and sanitize
	$effect(() => {
		async function renderMarkdown() {
			try {
				const rawHtml = await marked.parse(content);
				htmlContent = DOMPurify.sanitize(rawHtml);
			} catch (error) {
				console.error('Markdown parse error:', error);
				htmlContent = DOMPurify.sanitize(content);
			}
		}
		renderMarkdown();
	});
</script>

<!-- Import highlight.js theme -->
<svelte:head>
	<link
		rel="stylesheet"
		href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css"
	/>
</svelte:head>

<div class="prose prose-zinc max-w-none {className}">
	{@html htmlContent}
</div>

<style>
	/* Compact spacing for chat messages */
	:global(.prose p) {
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
	}

	:global(.prose p:first-child) {
		margin-top: 0;
	}

	:global(.prose p:last-child) {
		margin-bottom: 0;
	}

	:global(.prose ul, .prose ol) {
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
	}

	:global(.prose li) {
		margin-top: 0.25rem;
		margin-bottom: 0.25rem;
	}

	:global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) {
		margin-top: 1rem;
		margin-bottom: 0.5rem;
	}

	/* Code styling */
	:global(.prose pre) {
		background-color: hsl(240 4.8% 95.9%);
		border-radius: 0.5rem;
		padding: 1rem;
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
		overflow-x: auto;
	}

	:global(.prose code) {
		background-color: hsl(240 4.8% 95.9%);
		border-radius: 0.25rem;
		padding: 0.125rem 0.375rem;
		font-size: 0.875rem;
	}

	:global(.prose pre code) {
		background-color: transparent;
		padding: 0;
		border-radius: 0;
	}

	/* Table styling */
	:global(.prose table) {
		margin-top: 1rem;
		margin-bottom: 1rem;
		width: 100%;
		border-collapse: collapse;
		background-color: white;
	}

	:global(.prose th) {
		border: 1px solid hsl(240 5.9% 90%);
		background-color: white;
		padding: 0.5rem 1rem;
		text-align: left;
		font-weight: 600;
	}

	:global(.prose td) {
		border: 1px solid hsl(240 5.9% 90%);
		padding: 0.5rem 1rem;
		background-color: white;
	}

	:global(.prose thead) {
		background-color: white;
	}

	:global(.prose tbody tr:nth-child(even)) {
		background-color: white;
	}
</style>
