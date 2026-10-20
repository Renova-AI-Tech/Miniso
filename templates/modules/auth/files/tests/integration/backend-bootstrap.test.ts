import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp } from '../support/transport-app.js';

const local = {
  PROFILE: 'authenticated',
  AUTH_SECRET: 'a'.repeat(64),
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  MAILPIT_PORT: '8025',
  AUTH_EMAIL_FROM: 'acesso@renova.local',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://renova_app:synthetic-only-password@127.0.0.1:5432/renova_test',
};
const production = {
  NODE_ENV: 'production',
  DEPLOY_TARGET: 'railway',
  HOST: '::',
  FRONTEND_URL: 'https://app.example.com',
  AUTH_SECRET: '0123456789abcdef'.repeat(4),
  AUTH_EMAIL_FROM: 'access@example.com',
  RESEND_API_KEY: 're_SYNTHETIC_EMAIL_KEY',
  RAILWAY_PROJECT_ID: '21f5f513-6571-4a84-98e7-f7a385a14b94',
  RAILWAY_ENVIRONMENT_ID: '16167aac-e3b0-4d9a-bc18-d9629a0dc96c',
  RAILWAY_SERVICE_ID: '86284bf6-94d4-45b0-b8dd-5e1b1237e904',
  RENOVA_DB_NAME: 'renova_app',
  DATABASE_URL:
    'postgresql://renova_runtime:synthetic-long-random-credential@postgres.railway.internal:5432/renova_app',
};

describe('backend bootstrap', () => {
  it('inicia a API com configuracao local valida sem servicos externos', async () => {
    const app = await createApp(parseEnv(local));
    try {
      const response = await app.inject('/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(app.server.listening).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('aceita Railway com origem HTTPS email e identidade explícitos', () => {
    const parsed = parseEnv(production);
    expect(parsed.DEPLOY_TARGET).toBe('railway');
    expect(parsed.SMTP_HOST).toBeUndefined();
    expect(parsed.RESEND_API_KEY).toBe(production.RESEND_API_KEY);
  });

  it('recusa producao com configuracao insegura', () => {
    for (const change of [
      { FRONTEND_URL: 'http://example.com' },
      { DATABASE_URL: 'postgresql://postgres:password@database:5432/app' },
      { FRONTEND_URL: 'https://example.com/path' },
      { FRONTEND_URL: 'https://*.example.com' },
      { FRONTEND_URL: 'https://127.0.0.2' },
      { FRONTEND_URL: 'https://[::ffff:127.0.0.1]' },
      { FRONTEND_URL: 'https://app.localhost' },
      { FRONTEND_URL: 'https://app.railway.internal' },
      { FRONTEND_URL: 'https://localhost.' },
      { FRONTEND_URL: 'https://foo.local.' },
      {
        DATABASE_URL:
          'postgresql://app_runtime:synthetic-long-credential@database:5432/app?user=postgres',
      },
      { DEPLOY_TARGET: 'local' },
      { RAILWAY_PROJECT_ID: undefined },
      { RAILWAY_ENVIRONMENT_ID: undefined },
      { RAILWAY_SERVICE_ID: undefined },
      { RENOVA_DB_NAME: undefined },
      { RENOVA_DB_PROJECT_ID: production.RAILWAY_ENVIRONMENT_ID },
      { RENOVA_DB_ENVIRONMENT_ID: production.RAILWAY_PROJECT_ID },
      { RESEND_API_KEY: undefined },
      { RESEND_API_KEY: 'SENTINEL_PRIVATE_KEY' },
      { AUTH_SECRET: 'a'.repeat(64) },
      { AUTH_EMAIL_FROM: 'access@renova.local' },
      { SMTP_HOST: '127.0.0.1' },
      { MAILPIT_PORT: '8025' },
      { DATABASE_URL: production.DATABASE_URL.replace('renova_runtime:', 'renova_migrator:') },
      { DATABASE_URL: production.DATABASE_URL.replace('postgres.railway.internal', '127.0.0.1') },
      { DATABASE_URL: production.DATABASE_URL.replace('/renova_app', '/other_db') },
    ]) {
      expect(() =>
        parseEnv({
          ...production,
          ...change,
        }),
      ).toThrow('Invalid backend configuration:');
    }
  });

  it('recusa porta invalida e bind publico no desenvolvimento', () => {
    expect(() => parseEnv({ ...local, PORT: '0' })).toThrow('PORT');
    expect(() => parseEnv({ ...local, PORT: '65536' })).toThrow('PORT');
    expect(() => parseEnv({ ...local, HOST: '0.0.0.0' })).toThrow('HOST');
    expect(() => parseEnv({ ...local, FRONTEND_URL: 'https://example.com' })).toThrow(
      'FRONTEND_URL',
    );
    expect(() => parseEnv({ ...local, RESEND_API_KEY: production.RESEND_API_KEY })).toThrow(
      'RESEND_API_KEY',
    );
    expect(() => parseEnv({ ...local, SMTP_HOST: undefined })).toThrow('SMTP_HOST');
  });

  it('omite valores rejeitados e segredos do diagnostico', () => {
    const secret = 'SENTINEL_PRIVATE_DATABASE_VALUE';
    let message = '';
    try {
      parseEnv({ ...local, DATABASE_URL: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(secret);
  });

  it('distingue liveness de readiness e sanitiza falha de banco', async () => {
    let logs = '';
    const secret = 'SENTINEL_DATABASE_CONNECTION';
    const app = await createApp(parseEnv(local), {
      readiness: async () => {
        throw new Error(secret);
      },
      logStream: {
        write: (message) => {
          logs += message;
        },
      },
    });
    try {
      expect((await app.inject('/health')).statusCode).toBe(200);
      const response = await app.inject('/ready');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable' });
      expect(response.body + logs).not.toContain(secret);
    } finally {
      await app.close();
    }
  });

  it('nao reflete a URL ou request id fornecido pelo cliente', async () => {
    const secret = 'SENTINEL_REQUEST_VALUE';
    const app = await createApp(parseEnv(local));
    try {
      const response = await app.inject({
        url: `/missing?token=${secret}`,
        headers: { 'x-request-id': secret },
      });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain(secret);
      expect(response.headers['x-request-id']).not.toBe(secret);
    } finally {
      await app.close();
    }
  });
});
