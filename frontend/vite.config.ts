import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

import devtoolsJson from 'vite-plugin-devtools-json';

export default defineConfig({
	clearScreen: false,
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	server: {
		port: 5050,
		proxy: {
			'/orpc': {
				target: 'http://localhost:5040',
				changeOrigin: true
			},
			'/ws': {
				target: 'ws://localhost:5040',
				ws: true
			}
		}
	}
});
