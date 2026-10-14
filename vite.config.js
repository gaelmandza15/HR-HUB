import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Configuration Vite pour le frontend de l'application Tauri.
// ZÉRO CDN : Tailwind est compilé localement via @tailwindcss/vite,
// les polices (Inter) et icônes (FontAwesome) sont vendorisées depuis npm.
export default defineConfig({
  plugins: [tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2021',
    outDir: 'dist',
    // Polices woff2 + css dans un seul chunk, sans limite d'alerte
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
