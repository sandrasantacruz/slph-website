// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import icon from 'astro-icon';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), icon()],

  // CSRF-Check abschalten: Caddy macht TLS-Termination und proxied per HTTP,
  // der Node-Adapter rekonstruiert die Request-URL ohne https-Scheme, wodurch
  // Astros Origin-Vergleich (Origin: https://… vs. URL: http://…) fehlschlägt.
  security: { checkOrigin: false },

  server: {
    host: '127.0.0.1',
    port: 4321,
  },

  vite: {
    plugins: [tailwindcss()],
  },
});