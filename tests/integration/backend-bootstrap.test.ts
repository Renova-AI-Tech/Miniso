import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp } from '../../apps/backend/src/server/app.js';

const local = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://renova_app:synthetic-only-password@127.0.0.1:5432/renova_test',
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

  it('recusa producao com configuracao insegura', () => {
    for (const change of [
      { FRONTEND_URL: 'http://example.com' },
      { DATABASE_URL: 'postgresql://postgres:password@database:5432/app' },
      { FRONTEND_URL: 'https://example.com/path' },
      { FRONTEND_URL: 'https://*.example.com' },
      {
        DATABASE_URL:
          'postgresql://app_runtime:synthetic-long-credential@database:5432/app?user=postgres',
      },
      { PROFILE: 'authenticated' },
    ]) {
      expect(() =>
        parseEnv({
          ...local,
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://example.com',
          DATABASE_URL:
            'postgresql://app_runtime:synthetic-long-random-credential@database:5432/app',
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
