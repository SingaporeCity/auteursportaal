import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * CSP-hardening plugin (audit-finding H1).
 *
 * `index.html` bevat een dev-vriendelijke CSP met `'unsafe-inline'` voor
 * style-src-elem zodat Vite's HMR z'n inline-`<style>`-blokken kan injecteren.
 * Voor productie-builds vervangen we die token door een strikte versie:
 * `<style>`-blokken zijn dan geblokkeerd, alleen `<link rel="stylesheet">`
 * van `'self'` is toegestaan. Dit voorkomt dat een eventuele XSS-payload
 * een eigen `<style>` injecteert die via CSS-selector-attacks (bijv.
 * `:has()` + `background: url(...)`) data exfiltreert.
 *
 * `style-src-attr 'unsafe-inline'` blijft staan zodat `el.style.X = value`
 * via JS-API blijft werken (forecast-bars, payment-dot-colors etc.).
 * Inline-style attribuut-injectie via innerHTML is reeds afgedekt door
 * `eslint-plugin-no-unsanitized` + textContent-only DOM-mutaties.
 */
function strictCspPlugin(): Plugin {
  const productionCsp =
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self'; " +
    "style-src-elem 'self'; " +
    "style-src-attr 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://*.supabase.co; " +
    "font-src 'self' data:; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'none'; " +
    "frame-src 'self' https://*.supabase.co;";

  return {
    name: 'strict-csp-production',
    apply: 'build',
    transformIndexHtml(html: string): string {
      return html.replace(
        /(http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
        `$1${productionCsp}$2`
      );
    },
  };
}

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
  plugins: [strictCspPlugin()],
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
