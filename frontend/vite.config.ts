import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	clearScreen: false,
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5050
	}
});
