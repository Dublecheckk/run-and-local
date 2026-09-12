import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: 'mobile',
  publicDir: false,
  resolve: { alias: { '@': root } },
  plugins: [
    react(),
    {
      name: 'bundle-local-map',
      closeBundle() {
        mkdirSync(root + 'mobile-dist', { recursive: true });
        for (const asset of ['data', 'images', 'favicon.svg'])
          cpSync(root + 'public/' + asset, root + 'mobile-dist/' + asset, {
            recursive: true,
          });
      },
    },
  ],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: '../mobile-dist', emptyOutDir: true },
  server: { host: '127.0.0.1' },
});
