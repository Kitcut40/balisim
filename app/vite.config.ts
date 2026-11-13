import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Dev only: when the WebAssembly engine has not been built, serve the native engine. */
function nativeBridge(): Plugin {
  const bin = resolve(__dirname, '../target/release/balisim-devbridge');
  return {
    name: 'balisim-native-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__native/')) return next();
        if (!existsSync(bin)) {
          res.statusCode = 500;
          res.end('devbridge missing: cargo build --release -p balisim-devbridge');
          return;
        }
        const cmd = req.url.includes('library') ? 'library' : 'run';
        const child = spawn(bin, [cmd]);
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.on('close', () => {
          res.setHeader('Content-Type', 'application/json');
          res.end(out);
        });
        if (cmd === 'run') req.pipe(child.stdin);
        else child.stdin.end();
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), nativeBridge()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
});
