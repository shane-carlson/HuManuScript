import path from 'node:path';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createSlashApp } from './server/slashconnect.mjs';

const require = createRequire(import.meta.url);
const { writeAppVersion, readAppVersion } = require('./scripts/write-app-version.cjs') as {
  writeAppVersion: () => { version: string; build: string };
  readAppVersion: () => { version: string; build: string };
};

const electron = process.env.ELECTRON === '1';

/** Serves the version file the pack writes (0.1.<build>, or 0.1.0 for local dev). */
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

function slashApiPlugin(): Plugin {
  let slash: ReturnType<typeof createSlashApp> | null = null;
  const app = () => {
    if (!slash) {
      slash = createSlashApp({
        dataFile: path.resolve(process.cwd(), 'data', 'slashconnect.json'),
        seedDemo: true,
      });
    }
    return slash;
  };
  const attach = (middlewares: { use: (handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void) => void }) => {
    middlewares.use((req, res, next) => {
      const url = req.url || '';
      if (!url.startsWith('/api')) {
        next();
        return;
      }
      void app().handle(req, res);
    });
  };
  return {
    name: 'slashconnect-api',
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

export default defineConfig({
  base: electron ? './' : '/',
  plugins: [appVersionPlugin(), slashApiPlugin(), react()],
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
