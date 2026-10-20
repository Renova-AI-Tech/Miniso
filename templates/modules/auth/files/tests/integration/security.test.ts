import { afterEach, describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp, type AppOptions } from '../support/transport-app.js';
import { publicProcedure, router } from '../../apps/backend/src/server/trpc.js';

const env = parseEnv({
  PROFILE: 'authenticated',
  AUTH_SECRET: 'a'.repeat(64),
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  MAILPIT_PORT: '8025',
  AUTH_EMAIL_FROM: 'acesso@renova.local',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://renova_app:synthetic-only-password@127.0.0.1:5432/renova_test',
});
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
async function application(options: AppOptions = {}) {
  const app = await createApp(env, { logStream: { write: () => {} }, ...options });
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('API security', () => {
  it('recusa registro HTTP sem politica e rota privada sem auth instalado', async () => {
    const app = await application();
    expect(() => app.get('/undeclared', async () => 'unsafe')).toThrow('access policy');
    expect(() =>
      app.get('/private', { config: { accessPolicy: 'authenticated' } }, async () => 'unsafe'),
    ).toThrow('Auth is not installed');
  });

  it('recusa procedures sem politica ou privadas antes de iniciar', async () => {
    for (const accessPolicy of [undefined, 'authenticated'] as const) {
      const invalid = router({
        example: publicProcedure
          .meta({ accessPolicy: accessPolicy as never })
          .query(() => 'unsafe'),
      });
      await expect(application({ router: invalid })).rejects.toThrow('access policy');
    }
  });

  it('nega mutation de origem indevida antes do handler', async () => {
    let writes = 0;
    const app = await application({
      router: router({ write: publicProcedure.mutation(() => ++writes) }),
      verifyCsrf: async () => true,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/trpc/write',
      payload: '{}',
      headers: {
        cookie: 'session=SYNTHETIC',
        origin: 'https://attacker.example',
        'x-csrf-token': 'SYNTHETIC',
        'content-type': 'application/json',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(writes).toBe(0);
  });

  it.each(['https://attacker.example', 'null', ''])(
    'nega escrita HTTP e tRPC sem cookie com origem indevida: %s',
    async (origin) => {
      let writes = 0;
      const app = await application({
        router: router({ write: publicProcedure.mutation(() => ++writes) }),
      });
      app.post('/write', { config: { accessPolicy: 'public' } }, async () => ++writes);
      for (const url of ['/write', '/api/trpc/write']) {
        const response = await app.inject({
          method: 'POST',
          url,
          payload: '{}',
          headers: { origin, 'content-type': 'application/json' },
        });
        expect(response.statusCode).toBe(403);
      }
      expect(writes).toBe(0);
    },
  );

  it.each([undefined, env.FRONTEND_URL])(
    'permite escrita publica sem cookie com origem ausente ou autorizada: %s',
    async (origin) => {
      let writes = 0;
      const app = await application({
        router: router({ write: publicProcedure.mutation(() => ++writes) }),
      });
      app.post('/write', { config: { accessPolicy: 'public' } }, async () => ++writes);
      for (const url of ['/write', '/api/trpc/write']) {
        const response = await app.inject({
          method: 'POST',
          url,
          payload: '{}',
          headers: {
            ...(origin ? { origin } : {}),
            'content-type': 'application/json',
          },
        });
        expect(response.statusCode).toBe(200);
      }
      expect(writes).toBe(2);
    },
  );

  it('nega cookie sem origem ou prova CSRF e nao presume sessao valida', async () => {
    let writes = 0;
    const app = await application({
      router: router({ write: publicProcedure.mutation(() => ++writes) }),
    });
    for (const headers of [
      { cookie: 'session=SYNTHETIC' },
      { cookie: 'session=SYNTHETIC', origin: env.FRONTEND_URL },
      { cookie: 'session=SYNTHETIC', origin: env.FRONTEND_URL, 'x-csrf-token': 'untrusted' },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url: '/api/trpc/write', headers, payload: '{}' }))
          .statusCode,
      ).toBe(403);
    }
    expect(writes).toBe(0);
  });

  it('verifica prova CSRF pelo adaptador antes de executar mutation', async () => {
    let writes = 0;
    const app = await application({
      router: router({ write: publicProcedure.mutation(() => ++writes) }),
      verifyCsrf: async (_request, token) => token === 'SYNTHETIC_VALID_PROOF',
    });
    for (const [token, expectedStatus] of [
      ['invalid', 403],
      ['SYNTHETIC_VALID_PROOF', 200],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trpc/write',
        payload: '{}',
        headers: {
          cookie: 'session=SYNTHETIC',
          origin: env.FRONTEND_URL,
          'x-csrf-token': token,
          'content-type': 'application/json',
        },
      });
      expect(response.statusCode).toBe(expectedStatus);
    }
    expect(writes).toBe(1);
  });

  it('recusa corpo acima de 1 MiB antes de executar handler', async () => {
    let writes = 0;
    const app = await application();
    app.post('/bounded', { config: { accessPolicy: 'public' } }, async () => ++writes);
    const response = await app.inject({
      method: 'POST',
      url: '/bounded',
      payload: { value: 'x'.repeat(1024 * 1024) },
    });
    expect(response.statusCode).toBe(413);
    expect(writes).toBe(0);
  });

  it('limita IP em 120 requisicoes e nao confia em forwarding escolhido pelo cliente', async () => {
    const app = await application();
    for (let attempt = 0; attempt < 120; attempt++) {
      const response = await app.inject({
        url: '/health',
        headers: { 'x-forwarded-for': `192.0.2.${attempt + 1}` },
      });
      expect(response.statusCode).toBe(200);
    }
    const response = await app.inject({
      url: '/health',
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    expect(response.statusCode).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('sanitiza erros HTTP e tRPC preservando apenas correlacao', async () => {
    const secret = 'SENTINEL_SECRET_IN_ERROR';
    let logs = '';
    const app = await application({
      router: router({
        broken: publicProcedure.query(() => {
          throw new Error(secret);
        }),
      }),
      logStream: {
        write: (message) => {
          logs += message;
        },
      },
    });
    app.get('/broken', { config: { accessPolicy: 'public' } }, async () => {
      throw new Error(secret);
    });
    for (const url of ['/broken', '/api/trpc/broken']) {
      const response = await app.inject({
        url: `${url}?token=${secret}`,
        headers: { authorization: secret, cookie: secret },
      });
      expect(response.statusCode).toBe(500);
      expect(response.body).toContain(response.headers['x-request-id']);
      expect(response.body).not.toContain('stack');
      expect(response.body).not.toContain(secret);
    }
    expect(logs).not.toContain(secret);
    expect(logs).toContain('requestId');
  });

  it('recusa entrada invalida sem divulgar mensagem do parser', async () => {
    let executions = 0;
    const secret = 'SENTINEL_VALIDATION_INPUT';
    const app = await application({
      router: router({
        validate: publicProcedure
          .input((value: unknown) => {
            if (typeof value !== 'number') throw new Error(secret);
            return value;
          })
          .query(() => ++executions),
      }),
    });
    const response = await app.inject(
      `/api/trpc/validate?input=${encodeURIComponent(JSON.stringify(secret))}`,
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(secret);
    expect(executions).toBe(0);
  });

  it('recusa lotes tRPC que poderiam contornar o limite de requisicoes', async () => {
    const app = await application();
    const response = await app.inject('/api/trpc/system.health,system.health?batch=1');
    expect(response.statusCode).toBe(400);
  });

  it('sanitiza URL malformada ou longa antes do lifecycle de rotas', async () => {
    const secret = 'SENTINEL_REVIEW_PRIVATE_VALUE';
    let logs = '';
    const app = await application({
      logStream: {
        write: (message) => {
          logs += message;
        },
      },
    });
    for (const path of ['%ZZ', 'x'.repeat(1000)]) {
      const response = await app.inject({
        url: `/api/trpc/${path}?token=${secret}`,
        headers: { 'x-request-id': secret },
      });
      expect([400, 414]).toContain(response.statusCode);
      const requestId = response.headers['x-request-id'];
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.json()).toEqual({ error: 'Request rejected.', requestId });
      expect(response.body + logs).not.toContain(secret);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
});
