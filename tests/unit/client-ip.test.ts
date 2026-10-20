import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/backend/src/env.js';
import { clientIp } from '../../apps/backend/src/server/client-ip.js';

const auth = {
  AUTH_SECRET: '5e09f1a3c8b647d210a7e4d9c32f68b0a97dc3e124658fb0c7ae93b56df81042',
  AUTH_EMAIL_FROM: 'access@example.com',
};
const local = parseEnv({
  ...auth,
  NODE_ENV: 'test',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  MAILPIT_PORT: '8025',
  DATABASE_URL: 'postgresql://renova_runtime:synthetic-local-password@127.0.0.1:5432/test',
});
const railway = parseEnv({
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
});

describe('Railway client IP', () => {
  it('usa somente um IP valido do header documentado no Railway', () => {
    for (const ip of ['198.51.100.10', '2001:db8::1234']) {
      expect(
        clientIp(railway, {
          ip: '127.0.0.1',
          headers: { 'x-real-ip': ip, 'x-forwarded-for': '203.0.113.9' },
        }),
      ).toBe(ip);
    }
  });
  it('ignora headers falsos em desenvolvimento mesmo com IDs presentes', () => {
    expect(clientIp(local, { ip: '127.0.0.1', headers: { 'x-real-ip': '198.51.100.10' } })).toBe(
      '127.0.0.1',
    );
    expect(
      clientIp(
        { ...railway, NODE_ENV: 'test' },
        { ip: '127.0.0.1', headers: { 'x-real-ip': '198.51.100.10' } },
      ),
    ).toBe('127.0.0.1');
  });
  it('recusa headers duplicados, listas, espacos, scopes e IP invalido', () => {
    for (const ip of [
      undefined,
      '',
      ['198.51.100.1', '198.51.100.2'],
      '198.51.100.1,198.51.100.2',
      ' 198.51.100.1',
      'fe80::1%eth0',
      '999.1.1.1',
      'attacker.invalid',
    ]) {
      expect(clientIp(railway, { ip: '127.0.0.1', headers: { 'x-real-ip': ip } })).toBe(
        '127.0.0.1',
      );
    }
  });
  it('nao aceita X-Forwarded-For como substituto do contrato Railway', () => {
    expect(
      clientIp(railway, { ip: '127.0.0.1', headers: { 'x-forwarded-for': '198.51.100.1' } }),
    ).toBe('127.0.0.1');
    expect(
      clientIp(
        { ...railway, DEPLOY_TARGET: 'local' },
        { ip: '127.0.0.1', headers: { 'x-real-ip': '198.51.100.1' } },
      ),
    ).toBe('127.0.0.1');
  });
});
