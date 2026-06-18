import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import preprocess from 'svelte-preprocess';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte({
      preprocess: preprocess(),
    }),
  ],
  server: {
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
