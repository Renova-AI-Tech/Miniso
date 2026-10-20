import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp } from '../../apps/backend/src/server/app.js';
import { publicProcedure, router } from '../../apps/backend/src/server/trpc.js';

// Static HTTP fixtures have no identity database; application auth has its own integration suite.
const transportRouter = router({
  system: router({ health: publicProcedure.query(() => ({ status: 'ok' as const })) }),
});
const auth = {
  AUTH_SECRET: '5e09f1a3c8b647d210a7e4d9c32f68b0a97dc3e124658fb0c7ae93b56df81042',
  AUTH_EMAIL_FROM: 'access@example.com',
};
const production = {
  ...auth,
  RESEND_API_KEY: 're_SYNTHETIC_EMAIL_KEY',
  NODE_ENV: 'production',
  DEPLOY_TARGET: 'railway',
  RAILWAY_PROJECT_ID: 'fa03c408-2461-4401-9de8-a25449b629e6',
  RAILWAY_ENVIRONMENT_ID: 'ef3aa4b0-c060-4607-9741-3cb8d1756360',
  RAILWAY_SERVICE_ID: 'cab41b9f-c6a0-4bd1-a7c6-e163544fe337',
  RENOVA_DB_NAME: 'railway',
  FRONTEND_URL: 'https://project.example.com',
  DATABASE_URL:
    'postgresql://renova_runtime:synthetic-long-runtime-password@postgres.railway.internal:5432/railway',
};

describe('production frontend', () => {
  let root: string;
  const apps: FastifyInstance[] = [];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'renova-static-'));
    await mkdir(join(root, 'assets'));
    await writeFile(
      join(root, 'index.html'),
      '<!doctype html><html><body>Application</body></html>',
    );
    await writeFile(join(root, 'assets', 'app-a1b2c3.js'), 'document.body.dataset.ready="yes";');
    await writeFile(join(root, 'assets', 'app-a1b2c3.js.map'), 'SENTINEL_PRIVATE_SOURCEMAP');
    await writeFile(join(root, '.env'), 'SENTINEL_PRIVATE_ENV');
    await writeFile(join(root, 'renova-logo.png'), 'public-logo');
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await rm(root, { recursive: true, force: true });
  });
  async function start(source = production) {
    const app = await createApp(parseEnv(source), { frontendRoot: root, router: transportRouter });
    apps.push(app);
    return app;
  }

  it('serve SPA e API na mesma origem sem segredo', async () => {
    const app = await start();
    for (const url of ['/', '/refer%C3%AAncia', '/ativar?token=SENTINEL_INVITE_TOKEN']) {
      const response = await app.inject({ url, headers: { accept: 'text/html' } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['content-security-policy']).toContain("connect-src 'self'");
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
      expect(response.body).not.toContain('SENTINEL');
    }
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/ready')).statusCode).toBe(503);
  });

  it('cacheia assets existentes e preserva 404 para assets ausentes', async () => {
    const app = await start();
    const asset = await app.inject('/assets/app-a1b2c3.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(asset.headers['content-type']).toContain('javascript');
    const missing = await app.inject('/assets/missing.js');
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
    expect(missing.body).not.toContain('<html');
    expect((await app.inject('/assets')).statusCode).toBe(404);
    expect((await app.inject('/renova-logo.png')).body).toBe('public-logo');
  });

  it('nao transforma API, arquivos ou POST desconhecidos em SPA', async () => {
    const app = await start();
    for (const url of [
      '/api',
      '/api/missing',
      '/api/auth/get-session',
      '/missing.js',
      '/health/missing',
      '/ready/missing',
    ]) {
      const response = await app.inject({ url, headers: { accept: 'text/html' } });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('<html');
    }
    expect((await app.inject({ method: 'POST', url: '/unknown' })).statusCode).toBe(404);
    expect(
      (await app.inject({ url: '/unknown', headers: { accept: 'application/json' } })).statusCode,
    ).toBe(404);
  });

  it('recusa paths privados, sourcemaps e traversal simples ou codificado', async () => {
    const app = await start();
    for (const url of [
      '/.env',
      '/%2eenv',
      '/assets/app-a1b2c3.js.map',
      '/assets/../.env',
      '/assets/%2e%2e/.env',
      '/assets/%252e%252e/.env',
      '/assets/%5c.env',
      '/assets/%00.env',
      '/assets//app-a1b2c3.js',
    ]) {
      const response = await app.inject(url);
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.body).not.toContain('SENTINEL_PRIVATE');
    }
  });

  it('mantem HEAD sem corpo e nao confia em host ou protocolo encaminhados', async () => {
    const app = await start();
    app.get('/proxy-probe', { config: { accessPolicy: 'public' } }, async (request) => ({
      host: request.hostname,
      protocol: request.protocol,
      ip: request.ip,
    }));
    const response = await app.inject({
      method: 'HEAD',
      url: '/',
      headers: { 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'http' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
    expect(response.headers.location).toBeUndefined();
    const probe = await app.inject({
      url: '/proxy-probe',
      headers: {
        host: 'project.example.com',
        'x-forwarded-host': 'attacker.invalid',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.3',
      },
    });
    expect(probe.json()).toEqual({
      host: 'project.example.com',
      protocol: 'http',
      ip: '127.0.0.1',
    });
  });

  it('nao serve frontend no desenvolvimento e falha sem build em producao', async () => {
    const local = await createApp(
      parseEnv({
        ...auth,
        NODE_ENV: 'test',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        MAILPIT_PORT: '8025',
        DATABASE_URL:
          'postgresql://renova_runtime:synthetic-only-password@127.0.0.1:5432/renova_test',
      }),
      { frontendRoot: root, router: transportRouter },
    );
    apps.push(local);
    expect((await local.inject('/')).statusCode).toBe(404);
    await expect(
      createApp(parseEnv(production), {
        frontendRoot: join(root, 'missing'),
        router: transportRouter,
      }),
    ).rejects.toThrow();
  });

  it('limita por X-Real-IP apenas no alvo Railway validado', async () => {
    const app = await start();
    for (let index = 0; index < 120; index += 1) {
      expect(
        (await app.inject({ url: '/health', headers: { 'x-real-ip': '198.51.100.1' } })).statusCode,
      ).toBe(200);
    }
    expect(
      (await app.inject({ url: '/health', headers: { 'x-real-ip': '198.51.100.1' } })).statusCode,
    ).toBe(429);
    expect(
      (await app.inject({ url: '/health', headers: { 'x-real-ip': '198.51.100.2' } })).statusCode,
    ).toBe(200);
  });

  it('recusa producao sem destino ou com banco fora do binding explicito', () => {
    expect(parseEnv(production).DEPLOY_TARGET).toBe('railway');
    for (const field of [
      'DEPLOY_TARGET',
      'RAILWAY_PROJECT_ID',
      'RAILWAY_ENVIRONMENT_ID',
      'RAILWAY_SERVICE_ID',
      'RENOVA_DB_NAME',
    ]) {
      expect(() => parseEnv({ ...production, [field]: undefined })).toThrow(
        'Invalid backend configuration:',
      );
    }
    for (const change of [
      { RAILWAY_SERVICE_ID: 'not-a-uuid' },
      { FRONTEND_URL: 'https://127.0.0.2' },
      { FRONTEND_URL: 'https://localhost.' },
      { FRONTEND_URL: 'https://app.local.' },
      { FRONTEND_URL: 'https://[::1]' },
      { FRONTEND_URL: 'https://app.railway.internal' },
      { DATABASE_URL: production.DATABASE_URL.replace('renova_runtime', 'postgres') },
      {
        DATABASE_URL: production.DATABASE_URL.replace(
          'postgres.railway.internal',
          'outside.example.com',
        ),
      },
      { RENOVA_DB_NAME: 'different_database' },
      { RENOVA_DB_PROJECT_ID: production.RAILWAY_SERVICE_ID },
    ])
      expect(() => parseEnv({ ...production, ...change })).toThrow(
        'Invalid backend configuration:',
      );
  });
});
