import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import chromeManifest  from './manifest.chrome.json' with { type: 'json' };
import firefoxManifest from './manifest.firefox.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  const isFirefox = mode === 'firefox';
  const manifest  = isFirefox ? firefoxManifest : chromeManifest;

  return {
    plugins: [
      react(),
      crx({ manifest: manifest as any }),
    ],
    build: {
      outDir:     isFirefox ? 'dist/firefox' : 'dist/chrome',
      emptyOutDir: true,
      sourcemap:   false,
      // vite 6 默认 target es2022，crxjs 需要显式指定
      target: 'es2020',
    },
    // 解决 crxjs 在 vite 6 下的 HMR 端口问题
    server: {
      port: 5173,
      strictPort: true,
      hmr: { port: 5173 },
    },
  };
});
