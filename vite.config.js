import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Writes dist/files.json listing every bundled audio file, so the app can
// resolve playlist entries case-insensitively (Android is case-sensitive;
// Windows isn't — "there is a light.mp3" vs "There Is a Light.mp3" would
// otherwise 404 only on the phone).
function audioManifest() {
  return {
    name: 'cupid-audio-manifest',
    closeBundle() {
      try {
        const files = readdirSync(resolve(__dirname, 'dist')).filter((f) =>
          /\.(mp3|m4a|ogg|wav|flac)$/i.test(f)
        );
        writeFileSync(
          resolve(__dirname, 'dist', 'files.json'),
          JSON.stringify(files)
        );
        console.log(`[audio-manifest] ${files.length} audio files listed in files.json`);
      } catch (e) {
        console.warn('[audio-manifest] skipped:', e.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), audioManifest()],
  base: './',
  publicDir: 'audio',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
