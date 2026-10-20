import { stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const defaultRoot = fileURLToPath(new URL('../../../frontend/dist/', import.meta.url));
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function canonicalPath(url: string): string | undefined {
  try {
    const path = decodeURIComponent(url.split('?')[0] ?? '');
    if (
      !path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('\0') ||
      path.includes('%') ||
      path.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.')) ||
      path.includes('//')
    )
      return undefined;
    return path;
  } catch {
    return undefined;
  }
}

export async function registerFrontend(app: FastifyInstance, root = defaultRoot) {
  if (!(await stat(join(root, 'index.html'))).isFile()) {
    throw new Error('Frontend build is unavailable.');
  }
  await app.register(fastifyStatic, { root, serve: false, dotfiles: 'deny' });
  app.route({
    method: ['GET', 'HEAD'],
    url: '/*',
    config: { accessPolicy: 'public' },
    async handler(request, reply) {
      const path = canonicalPath(request.raw.url ?? request.url);
      if (
        !path ||
        /^\/(?:api|health|ready)(?:\/|$)/.test(path) ||
        path === '/assets' ||
        path.endsWith('.map')
      ) {
        return reply.code(404).send({ error: 'Not found.', requestId: request.id });
      }
      reply.header('content-security-policy', csp);
      reply.header('cache-control', 'no-cache');
      if (path.startsWith('/assets/')) {
        reply.header('cache-control', 'public, max-age=31536000, immutable');
        return reply.sendFile(path.slice(1), { cacheControl: false });
      }
      if (posix.extname(path)) {
        return reply.sendFile(path.slice(1), { cacheControl: false });
      }
      const accept = request.headers.accept;
      if (accept && !accept.includes('text/html') && !accept.includes('*/*')) {
        return reply.code(404).send({ error: 'Not found.', requestId: request.id });
      }
      return reply.sendFile('index.html', { cacheControl: false });
    },
  });
}
