import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { parseProjectConfig } from '../../scripts/project/config.mjs';

const config = parseProjectConfig(
  JSON.parse(readFileSync(new URL('../../renova.project.json', import.meta.url), 'utf8')),
);
export default defineConfig(({ command }) => {
  const serving = command === 'serve';
  const origin = new URL(
    serving ? (process.env.FRONTEND_URL ?? 'http://127.0.0.1:43123') : 'http://127.0.0.1:43123',
  );
  const backendPort = serving ? Number(process.env.PORT ?? 43124) : 43124;
  const developmentNonce = randomBytes(24).toString('base64');
  if (
    serving &&
    (origin.hostname !== '127.0.0.1' ||
      origin.protocol !== 'http:' ||
      !origin.port ||
      !Number.isInteger(backendPort) ||
      backendPort < 1 ||
      backendPort > 65535)
  ) {
    throw new Error('Invalid local frontend/backend address. Run pnpm db:up.');
  }

  return {
    plugins: [react(), tailwindcss()],
    define: { __PROJECT_NAME__: JSON.stringify(config.project.displayName) },
    html: command === 'serve' ? { cspNonce: developmentNonce } : {},
    server: {
      host: '127.0.0.1',
      port: Number(origin.port),
      strictPort: true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: false },
      },
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${developmentNonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
      },
    },
    build: { sourcemap: false, assetsInlineLimit: 0 },
  };
});
