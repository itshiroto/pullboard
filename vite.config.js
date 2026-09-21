import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// PORT lets a launcher pick the port (e.g. a second checkout while 5173 is taken).
export default defineConfig({ plugins: [svelte()], server: { port: Number(process.env.PORT) || 5173 } });
