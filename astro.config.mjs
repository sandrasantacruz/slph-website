// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [icon()],

  server: {
    host: '127.0.0.1',
    port: 4321,
  },

  vite: {
    plugins: [tailwindcss()],
  },
});