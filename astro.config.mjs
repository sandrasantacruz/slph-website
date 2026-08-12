// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Kanonische Domain. Einzige Quelle für alle absoluten URLs der Seite:
  // `src/lib/seo.ts` liest sie als `import.meta.env.SITE` wieder aus und baut
  // daraus canonical, og:image, JSON-LD und die Sitemap.
  site: 'https://silospeceshablaran.com',
  output: 'static',
  integrations: [icon()],
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pulpo.cloud' },
      // lokale pulpo-Instanz (PULPO_URL in .env)
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },

  server: {
    host: '127.0.0.1',
    port: 4321,
  },

  vite: {
    plugins: [tailwindcss()],
  },
});