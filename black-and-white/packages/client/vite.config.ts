import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import preprocess from 'svelte-preprocess';

export default defineConfig({
  plugins: [
    svelte({
      preprocess: preprocess(),
    }),
  ],
  server: {
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
