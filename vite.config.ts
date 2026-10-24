import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const require = createRequire(import.meta.url);
const { writeAppVersion, readAppVersion } = require('./scripts/write-app-version.cjs') as {
  writeAppVersion: () => { version: string; build: string };
  readAppVersion: () => { version: string; build: string };
};

const electron = process.env.ELECTRON === '1';

/** Serves the version file the pack writes (package.json version + HM_BUILD_NUMBER). */
function appVersionPlugin(): Plugin {
  const virtualId = 'virtual:app-version';
  const resolvedId = `\0${virtualId}`;
  return {
    name: 'humanuscript-app-version',
    config() {
      writeAppVersion();
    },
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return null;
      // Rewrite from this process's env, then read that file. A stale pack file
      // cannot stick to `npm run dev`, and a signed pack still bakes its run number.
      writeAppVersion();
      const info = readAppVersion();
      return `export const appVersion = ${JSON.stringify(info)};\n`;
    },
  };
}

export default defineConfig({
  base: electron ? './' : '/',
  plugins: [appVersionPlugin(), react()],
  server: {
    host: '127.0.0.1',
    port: 47321,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 47321,
    strictPort: true,
  },
});
