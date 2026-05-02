import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    // Sourcemaps alleen lokaal/dev. Productie-build = false zodat de
    // gecompileerde JS niet 1-op-1 reverse-mapt naar TypeScript-bron.
    // Audit-finding C1 (docs/AUDIT-2026-05-02.md).
    sourcemap: process.env['NODE_ENV'] !== 'production',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
